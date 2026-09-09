import { describe, expect, it } from "vitest";

import { privateKeyToAccount } from "viem/accounts";
import { BSC_TESTNET_PROTOCOL } from "./contracts";
import {
  createSignedQuote,
  hashTaskCommitment,
  validateTask,
  verifySignedQuote,
} from "./quote";

const PRIVATE_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const account = privateKeyToAccount(PRIVATE_KEY);
const now = 1_787_000_000;

const rebalancingTask = {
  skill: "rebalancing" as const,
  parameters: {
    poolAddress: "0x1111111111111111111111111111111111111111",
    rangeWidthBps: 1000,
  },
};

describe("reference seller quotes", () => {
  it("locks official BSC testnet protocol addresses", () => {
    expect(BSC_TESTNET_PROTOCOL).toEqual({
      chainId: 97,
      identityRegistry: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
      commerce: "0xa206c0517B6371C6638CD9e4a42Cc9f02A33B0DE",
      evaluatorRouter: "0xd7d36d66d2f1b608a0f943f722d27e3744f66f25",
      optimisticPolicy: "0xd6a4217588F6B1F5657a92A3e94E6422aD771cEA",
      paymentToken: "0xc70B8741B8B07A6d61E54fd4B20f22Fa648E5565",
    });
  });

  it("canonicalizes equivalent task objects to one commitment", () => {
    expect(hashTaskCommitment(rebalancingTask)).toBe(hashTaskCommitment({
      parameters: { rangeWidthBps: 1000, poolAddress: "0x1111111111111111111111111111111111111111" },
      skill: "rebalancing",
    }));
  });

  it.each([
    ["rebalancing", { poolAddress: "bad", rangeWidthBps: 1000 }],
    ["grid-trading", { poolAddress: "0x1111111111111111111111111111111111111111", lowerPrice: 10, upperPrice: 9, levels: 4 }],
    ["yield-optimisation", { markets: [] }],
    ["health-factor-monitoring", { comptrollerAddress: "0x1111111111111111111111111111111111111111", account: "bad" }],
  ])("rejects invalid %s task parameters", (skill, parameters) => {
    expect(() => validateTask({ skill, parameters })).toThrow();
  });

  it("signs and verifies an expiring EIP-712 quote", async () => {
    const quote = await createSignedQuote({
      account,
      agentId: "97:0x8004a818bfb912233c491871b3d84c89a494bd9e:2000",
      task: rebalancingTask,
      amount: 10_000n,
      now,
      ttlSeconds: 600,
      nonce: `0x${"12".repeat(32)}`,
    });

    await expect(verifySignedQuote(quote, {
      expectedProvider: account.address,
      now: now + 60,
      usedNonces: new Set(),
    })).resolves.toMatchObject({ provider: account.address, amount: "10000" });
  });

  it.each([
    ["expired", { now: now + 601 }],
    ["wrong provider", { expectedProvider: "0x2222222222222222222222222222222222222222" }],
    ["replayed", { usedNonces: new Set([`0x${"12".repeat(32)}`]) }],
  ])("rejects an %s quote", async (_label, overrides) => {
    const quote = await createSignedQuote({
      account,
      agentId: "97:0x8004a818bfb912233c491871b3d84c89a494bd9e:2000",
      task: rebalancingTask,
      amount: 10_000n,
      now,
      ttlSeconds: 600,
      nonce: `0x${"12".repeat(32)}`,
    });

    await expect(verifySignedQuote(quote, {
      expectedProvider: account.address,
      now: now + 60,
      usedNonces: new Set(),
      ...overrides,
    })).rejects.toThrow();
  });
});
