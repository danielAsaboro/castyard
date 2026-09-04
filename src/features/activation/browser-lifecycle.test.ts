import { describe, expect, it } from "vitest";
import { encodeAbiParameters, encodeEventTopics } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { BSC_TESTNET_PROTOCOL } from "./contracts";
import { createJobDescription, createSignedQuote } from "./quote";
import {
  buildBrowserActivationCalls,
  advanceBrowserActivation,
  cancelOpenBrowserActivation,
  claimExpiredBrowserActivationRefund,
  reconcileExpiredBrowserActivation,
  nextBrowserActivationAction,
  parseCreatedJobId,
  type BrowserActivationDependencies,
  type BrowserActivationReceipt,
} from "./browser-lifecycle";

const providerAccount = privateKeyToAccount(`0x${"11".repeat(32)}`);
const quote = await createSignedQuote({
  account: providerAccount,
  agentId: "97:0x8004a818bfb912233c491871b3d84c89a494bd9e:1830",
  amount: 10_000_000_000_000_000n,
  now: 1_000,
  ttlSeconds: 600,
  nonce: `0x${"22".repeat(32)}`,
  task: {
    skill: "rebalancing",
    parameters: { poolAddress: "0x145ECf200CF4Eb61e61E5E9E73eD63F8643816df", rangeWidthBps: 1_000 },
  },
});

function receipt(overrides: Partial<BrowserActivationReceipt> = {}): BrowserActivationReceipt {
  return {
    version: 1,
    quote,
    buyer: "0x291DB336D8b50C373F05045155c0fA7CdECe1451",
    stage: "quoted",
    transactions: {},
    updatedAt: "2026-09-04T00:00:00.000Z",
    ...overrides,
  };
}

function createdLog(jobId = 42n) {
  const topics = encodeEventTopics({
    abi: [{
      type: "event",
      name: "JobCreated",
      inputs: [
        { indexed: true, name: "jobId", type: "uint256" },
        { indexed: true, name: "client", type: "address" },
        { indexed: true, name: "provider", type: "address" },
        { indexed: false, name: "evaluator", type: "address" },
        { indexed: false, name: "expiredAt", type: "uint256" },
        { indexed: false, name: "hook", type: "address" },
      ],
    }] as const,
    eventName: "JobCreated",
    args: {
      jobId,
      client: "0x291DB336D8b50C373F05045155c0fA7CdECe1451",
      provider: quote.provider,
    },
  });
  const data = encodeAbiParameters(
    [{ type: "address" }, { type: "uint256" }, { type: "address" }],
    [BSC_TESTNET_PROTOCOL.evaluatorRouter, 11_800n, BSC_TESTNET_PROTOCOL.evaluatorRouter],
  );
  return { address: BSC_TESTNET_PROTOCOL.commerce, data, topics };
}

function dependencies(overrides: Partial<BrowserActivationDependencies> = {}): BrowserActivationDependencies {
  let transaction = 0;
  let chainStatus = 0;
  return {
    now: () => 1_100,
    buyer: "0x291DB336D8b50C373F05045155c0fA7CdECe1451",
    expectedProvider: quote.provider,
    readDisputeWindow: async () => 3_600n,
    readTokenBalance: async () => BigInt(quote.amount),
    readTokenAllowance: async () => 0n,
    readJob: async (jobId) => ({
      id: jobId,
      client: "0x291DB336D8b50C373F05045155c0fA7CdECe1451",
      provider: quote.provider,
      evaluator: BSC_TESTNET_PROTOCOL.evaluatorRouter,
      description: createJobDescription(quote),
      budget: BigInt(quote.amount),
      expiredAt: 10_000n,
      status: chainStatus,
      hook: BSC_TESTNET_PROTOCOL.evaluatorRouter,
      submittedAt: chainStatus === 2 ? 1_200n : 0n,
      deliverable: chainStatus === 2 ? `0x${"bb".repeat(32)}` : `0x${"00".repeat(32)}`,
    }),
    write: async (call) => {
      transaction += 1;
      if (call.functionName === "fund") chainStatus = 1;
      if (call.functionName === "settle") chainStatus = 3;
      return {
        transactionHash: `0x${transaction.toString(16).padStart(64, "0")}`,
        logs: transaction === 1 ? [createdLog()] : [],
      };
    },
    notifySeller: async () => {
      chainStatus = 2;
      return {
        transactionHash: `0x${"aa".repeat(32)}`,
        deliverableHash: `0x${"bb".repeat(32)}`,
        deliverable: { result: "live" },
        submittedAt: 1_200n,
      };
    },
    ...overrides,
  };
}

describe("browser ERC-8183 lifecycle", () => {
  it("builds exact bounded calls from the verified quote", () => {
    const calls = buildBrowserActivationCalls(quote, 3_600n, 1_000);

    expect(calls.createJob).toMatchObject({
      address: BSC_TESTNET_PROTOCOL.commerce,
      functionName: "createJob",
      args: [
        quote.provider,
        BSC_TESTNET_PROTOCOL.evaluatorRouter,
        11_800n,
        createJobDescription(quote),
        BSC_TESTNET_PROTOCOL.evaluatorRouter,
      ],
    });
    expect(calls.registerJob.args).toEqual([0n, BSC_TESTNET_PROTOCOL.optimisticPolicy]);
    expect(calls.setBudget.args).toEqual([0n, 10_000_000_000_000_000n, "0x"]);
    expect(calls.approve.args).toEqual([BSC_TESTNET_PROTOCOL.commerce, 10_000_000_000_000_000n]);
    expect(calls.fund.args).toEqual([0n, 10_000_000_000_000_000n, "0x"]);
  });

  it("advances one explicit wallet action at a time and resumes from a receipt", () => {
    expect(nextBrowserActivationAction(receipt())).toBe("createJob");
    expect(nextBrowserActivationAction(receipt({ stage: "open", jobId: "42" }))).toBe("registerJob");
    expect(nextBrowserActivationAction(receipt({ stage: "registered", jobId: "42" }))).toBe("setBudget");
    expect(nextBrowserActivationAction(receipt({ stage: "budgeted", jobId: "42" }))).toBe("approve");
    expect(nextBrowserActivationAction(receipt({ stage: "approved", jobId: "42" }))).toBe("fund");
    expect(nextBrowserActivationAction(receipt({ stage: "funded", jobId: "42" }))).toBe("notifySeller");
    expect(nextBrowserActivationAction(receipt({ stage: "submitted", jobId: "42" }))).toBe("waitToSettle");
    expect(nextBrowserActivationAction(receipt({ stage: "completed", jobId: "42" }))).toBe("complete");
  });

  it("parses only the commerce JobCreated event", () => {
    const valid = createdLog();

    expect(parseCreatedJobId([
      { ...valid, address: "0x1111111111111111111111111111111111111111" },
      valid,
    ])).toBe(42n);
  });

  it("preflights the buyer balance before creating a job", async () => {
    let wrote = false;
    await expect(advanceBrowserActivation(receipt(), dependencies({
      readTokenBalance: async () => BigInt(quote.amount) - 1n,
      write: async () => { wrote = true; throw new Error("unexpected"); },
    }))).rejects.toThrow("needs at least 0.01 U");
    expect(wrote).toBe(false);
  });

  it("executes and records exactly one explicit wallet action per advance", async () => {
    const deps = dependencies();
    const open = await advanceBrowserActivation(receipt(), deps);
    expect(open).toMatchObject({ stage: "open", jobId: "42" });
    expect(open.transactions.createJob).toMatch(/^0x[0-9a-f]{64}$/);

    const registered = await advanceBrowserActivation(open, deps);
    expect(registered.stage).toBe("registered");
    expect(registered.transactions.registerJob).toMatch(/^0x[0-9a-f]{64}$/);

    const budgeted = await advanceBrowserActivation(registered, deps);
    expect(budgeted.stage).toBe("budgeted");
    expect(budgeted.transactions.setBudget).toMatch(/^0x[0-9a-f]{64}$/);

    const approved = await advanceBrowserActivation(budgeted, deps);
    expect(approved.stage).toBe("approved");
    expect(approved.transactions.approve).toMatch(/^0x[0-9a-f]{64}$/);

    const funded = await advanceBrowserActivation(approved, deps);
    expect(funded.stage).toBe("funded");
    expect(funded.transactions.fund).toMatch(/^0x[0-9a-f]{64}$/);

    const submitted = await advanceBrowserActivation(funded, deps);
    expect(submitted).toMatchObject({
      stage: "submitted",
      deliverableHash: `0x${"bb".repeat(32)}`,
      settleAfter: "4800",
    });
    expect(submitted.transactions.submit).toBe(`0x${"aa".repeat(32)}`);
  });

  it("skips an unnecessary approval without inventing a transaction", async () => {
    const approved = await advanceBrowserActivation(
      receipt({ stage: "budgeted", jobId: "42" }),
      dependencies({ readTokenAllowance: async () => BigInt(quote.amount) }),
    );
    expect(approved.stage).toBe("approved");
    expect(approved.transactions.approve).toBeUndefined();
  });

  it("fails closed when local receipt data points at a different on-chain provider", async () => {
    let wrote = false;
    const deps = dependencies({
      readJob: async () => ({
        id: 42n,
        client: "0x291DB336D8b50C373F05045155c0fA7CdECe1451",
        provider: "0x3333333333333333333333333333333333333333",
        evaluator: BSC_TESTNET_PROTOCOL.evaluatorRouter,
        description: createJobDescription(quote),
        budget: 0n,
        expiredAt: 10_000n,
        status: 0,
        hook: BSC_TESTNET_PROTOCOL.evaluatorRouter,
        submittedAt: 0n,
        deliverable: `0x${"00".repeat(32)}`,
      }),
      write: async () => { wrote = true; throw new Error("unexpected"); },
    });

    await expect(advanceBrowserActivation(receipt({ stage: "open", jobId: "42" }), deps))
      .rejects.toThrow("provider does not match");
    expect(wrote).toBe(false);
  });

  it("settles only after the authoritative dispute window", async () => {
    const submitted = receipt({ stage: "submitted", jobId: "42", settleAfter: "1200" });
    await expect(advanceBrowserActivation(submitted, dependencies({ now: () => 1_200 })))
      .rejects.toThrow("Dispute window is still open");

    const completed = await advanceBrowserActivation(submitted, dependencies({
      now: () => 1_201,
      readJob: async (jobId) => ({
        id: jobId,
        client: "0x291DB336D8b50C373F05045155c0fA7CdECe1451",
        provider: quote.provider,
        evaluator: BSC_TESTNET_PROTOCOL.evaluatorRouter,
        description: createJobDescription(quote),
        budget: BigInt(quote.amount),
        expiredAt: 10_000n,
        status: 2,
        hook: BSC_TESTNET_PROTOCOL.evaluatorRouter,
        submittedAt: 1_100n,
        deliverable: `0x${"00".repeat(32)}`,
      }),
    }));
    expect(completed.stage).toBe("completed");
    expect(completed.transactions.settle).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("cancels an unfunded open job without requiring an unexpired quote", async () => {
    const cancelled = await cancelOpenBrowserActivation(
      receipt({ stage: "registered", jobId: "42", expiredAt: "10000" }),
      dependencies({ now: () => 1_700 }),
    );
    expect(cancelled.stage).toBe("cancelled");
    expect(cancelled.transactions.cancel).toMatch(/^0x[0-9a-f]{64}$/);
  });

  it("claims expired escrow and reconciles the router in separate confirmed writes", async () => {
    const expiredJob = {
      id: 42n,
      client: "0x291DB336D8b50C373F05045155c0fA7CdECe1451" as const,
      provider: quote.provider,
      evaluator: BSC_TESTNET_PROTOCOL.evaluatorRouter,
      description: createJobDescription(quote),
      budget: BigInt(quote.amount),
      expiredAt: 1_000n,
      status: 1,
      hook: BSC_TESTNET_PROTOCOL.evaluatorRouter,
      submittedAt: 0n,
      deliverable: `0x${"00".repeat(32)}` as const,
    };
    const refunded = await claimExpiredBrowserActivationRefund(
      receipt({ stage: "funded", jobId: "42", expiredAt: "1000" }),
      dependencies({ now: () => 1_100, readJob: async () => expiredJob }),
    );
    expect(refunded.stage).toBe("refundClaimed");
    expect(refunded.transactions.claimRefund).toMatch(/^0x[0-9a-f]{64}$/);

    const reconciled = await reconcileExpiredBrowserActivation(
      refunded,
      dependencies({ now: () => 1_101, readJob: async () => ({ ...expiredJob, status: 5 }) }),
    );
    expect(reconciled.stage).toBe("refunded");
    expect(reconciled.transactions.markExpired).toMatch(/^0x[0-9a-f]{64}$/);
  });
});
