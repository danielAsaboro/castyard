import { describe, expect, it } from "vitest";
import { encodeAbiParameters, encodeEventTopics } from "viem";

import { BSC_TESTNET_PROTOCOL } from "./contracts";
import { createJobDescription, type SignedQuote } from "./quote";
import {
  buildBrowserActivationCalls,
  nextBrowserActivationAction,
  parseCreatedJobId,
  type BrowserActivationReceipt,
} from "./browser-lifecycle";

const quote: SignedQuote = {
  version: 1,
  chainId: 97,
  commerce: BSC_TESTNET_PROTOCOL.commerce,
  provider: "0x74258A428e94294F14a8c8308CE21259223A0187",
  agentId: "97:0x8004a818bfb912233c491871b3d84c89a494bd9e:1830",
  taskCommitment: `0x${"11".repeat(32)}`,
  paymentToken: BSC_TESTNET_PROTOCOL.paymentToken,
  amount: "10000000000000000",
  issuedAt: 1_000,
  expiresAt: 1_600,
  nonce: `0x${"22".repeat(32)}`,
  task: {
    skill: "rebalancing",
    parameters: { poolAddress: "0x145ECf200CF4Eb61e61E5E9E73eD63F8643816df", rangeWidthBps: 1_000 },
  },
  signature: `0x${"33".repeat(65)}`,
};

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
        jobId: 42n,
        client: "0x291DB336D8b50C373F05045155c0fA7CdECe1451",
        provider: quote.provider,
      },
    });
    const data = encodeAbiParameters(
      [{ type: "address" }, { type: "uint256" }, { type: "address" }],
      [BSC_TESTNET_PROTOCOL.evaluatorRouter, 11_800n, BSC_TESTNET_PROTOCOL.evaluatorRouter],
    );

    expect(parseCreatedJobId([
      { address: "0x1111111111111111111111111111111111111111", data, topics },
      { address: BSC_TESTNET_PROTOCOL.commerce, data, topics },
    ])).toBe(42n);
  });
});
