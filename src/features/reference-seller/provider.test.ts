import { describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";

import { createJobDescription, createSignedQuote } from "@/features/activation/quote";
import { processFundedJob, type ProviderDependencies } from "./provider";

const account = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
const task = { skill: "health-factor-monitoring" as const, parameters: { comptrollerAddress: "0x1111111111111111111111111111111111111111" as const, account: "0x2222222222222222222222222222222222222222" as const } };

async function setup(overrides: Partial<ProviderDependencies> = {}) {
  const quote = await createSignedQuote({ account, agentId: "97:0x8004a818bfb912233c491871b3d84c89a494bd9e:2000", task, amount: 10_000n, now: 1000, ttlSeconds: 600, nonce: `0x${"12".repeat(32)}` });
  const saved: unknown[] = [];
  const dependencies: ProviderDependencies = {
    now: () => 1100,
    expectedProvider: account.address,
    usedNonces: new Set(),
    getJob: async () => ({ id: 7n, client: "0x3333333333333333333333333333333333333333", provider: account.address, evaluator: "0x4444444444444444444444444444444444444444", description: createJobDescription(quote), budget: 10_000n, expiredAt: 2000n, status: 1, hook: "0x5555555555555555555555555555555555555555", submittedAt: 0n, deliverable: `0x${"00".repeat(32)}` }),
    acquire: async () => true,
    execute: async () => ({ skill: task.skill, chainId: 97, blockNumber: "10", observedAt: "1970-01-01T00:18:20.000Z", sources: [], assumptions: [], data: { liquidityMantissa: "10" } }),
    saveDeliverable: async (record) => { saved.push(record); },
    saveFailure: async () => undefined,
    submit: async () => `0x${"34".repeat(32)}`,
    waitForReceipt: async () => ({ status: "success", blockNumber: 11n }),
    ...overrides,
  };
  return { quote, dependencies, saved };
}

describe("funded ERC-8183 provider processing", () => {
  it("validates, executes, persists, submits the content hash, and records receipt", async () => {
    const { quote, dependencies, saved } = await setup();
    const result = await processFundedJob(7n, quote, dependencies);
    expect(result).toMatchObject({ jobId: "7", transactionHash: `0x${"34".repeat(32)}`, receiptBlockNumber: "11" });
    expect(result.deliverableHash).toMatch(/^0x[0-9a-f]{64}$/);
    expect(saved).toHaveLength(2);
    expect(saved[0]).toMatchObject({ state: "executed", jobId: "7", deliverableHash: result.deliverableHash });
    expect(saved[1]).toMatchObject({ state: "submitted", transactionHash: result.transactionHash });
  });

  it("accepts an expired quote as historical evidence when its funded onchain job is still live", async () => {
    const { quote, dependencies } = await setup({ now: () => 1700 });
    const result = await processFundedJob(7n, quote, dependencies);
    expect(result).toMatchObject({ jobId: "7", transactionHash: `0x${"34".repeat(32)}` });
  });

  it.each([
    ["unfunded", { getJob: async () => ({ ...(await (await setup()).dependencies.getJob(7n)), status: 0 }) }],
    ["wrong provider", { getJob: async () => ({ ...(await (await setup()).dependencies.getJob(7n)), provider: "0x6666666666666666666666666666666666666666" }) }],
    ["wrong budget", { getJob: async () => ({ ...(await (await setup()).dependencies.getJob(7n)), budget: 9_999n }) }],
    ["expired", { now: () => 2000 }],
    ["wrong commitment", { getJob: async () => ({ ...(await (await setup()).dependencies.getJob(7n)), description: "different" }) }],
  ])("refuses an %s job before executing", async (_label, overrides) => {
    const execute = async () => { throw new Error("must not execute"); };
    const { quote, dependencies } = await setup({ ...overrides, execute });
    await expect(processFundedJob(7n, quote, dependencies)).rejects.toThrow();
  });

  it("does not broadcast when execution fails", async () => {
    let submitted = false;
    const { quote, dependencies } = await setup({ execute: async () => { throw new Error("RPC unavailable"); }, submit: async () => { submitted = true; return `0x${"34".repeat(32)}`; } });
    await expect(processFundedJob(7n, quote, dependencies)).rejects.toThrow("RPC unavailable");
    expect(submitted).toBe(false);
  });

  it("rejects a duplicate atomic claim before execution", async () => {
    let executed = false;
    const { quote, dependencies } = await setup({ acquire: async () => false, execute: async () => { executed = true; throw new Error("unexpected"); } });
    await expect(processFundedJob(7n, quote, dependencies)).rejects.toThrow("already being processed");
    expect(executed).toBe(false);
  });

  it("rejects a failed submission receipt", async () => {
    const { quote, dependencies } = await setup({ waitForReceipt: async () => ({ status: "reverted", blockNumber: 11n }) });
    await expect(processFundedJob(7n, quote, dependencies)).rejects.toThrow("reverted");
  });
});
