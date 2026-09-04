import { decodeEventLog, getAddress, type Address, type Hex } from "viem";

import { BSC_TESTNET_PROTOCOL } from "./contracts";
import { createJobDescription, type SignedQuote } from "./quote";

export type BrowserActivationStage =
  | "quoted"
  | "open"
  | "registered"
  | "budgeted"
  | "approved"
  | "funded"
  | "submitted"
  | "completed"
  | "failed";

export type BrowserActivationTransaction =
  | "createJob"
  | "registerJob"
  | "setBudget"
  | "approve"
  | "fund"
  | "submit"
  | "settle";

export interface BrowserActivationReceipt {
  version: 1;
  quote: SignedQuote;
  buyer: Address;
  stage: BrowserActivationStage;
  jobId?: string;
  transactions: Partial<Record<BrowserActivationTransaction, Hex>>;
  deliverableHash?: Hex;
  deliverable?: unknown;
  settleAfter?: string;
  error?: string;
  updatedAt: string;
}

export type BrowserActivationAction =
  | "createJob"
  | "registerJob"
  | "setBudget"
  | "approve"
  | "fund"
  | "notifySeller"
  | "waitToSettle"
  | "complete"
  | "recover";

export const jobCreatedEvent = [{
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
}] as const;

export const commerceBrowserAbi = [
  ...jobCreatedEvent,
  {
    type: "function",
    name: "createJob",
    stateMutability: "nonpayable",
    inputs: [
      { name: "provider", type: "address" },
      { name: "evaluator", type: "address" },
      { name: "expiredAt", type: "uint256" },
      { name: "description", type: "string" },
      { name: "hook", type: "address" },
    ],
    outputs: [{ name: "jobId", type: "uint256" }],
  },
  {
    type: "function",
    name: "setBudget",
    stateMutability: "nonpayable",
    inputs: [
      { name: "jobId", type: "uint256" },
      { name: "amount", type: "uint256" },
      { name: "optParams", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "fund",
    stateMutability: "nonpayable",
    inputs: [
      { name: "jobId", type: "uint256" },
      { name: "expectedBudget", type: "uint256" },
      { name: "optParams", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

export const routerBrowserAbi = [
  {
    type: "function",
    name: "registerJob",
    stateMutability: "nonpayable",
    inputs: [{ name: "jobId", type: "uint256" }, { name: "policy", type: "address" }],
    outputs: [],
  },
  {
    type: "function",
    name: "settle",
    stateMutability: "nonpayable",
    inputs: [{ name: "jobId", type: "uint256" }, { name: "evidence", type: "bytes" }],
    outputs: [],
  },
] as const;

export const erc20ApprovalAbi = [{
  type: "function",
  name: "approve",
  stateMutability: "nonpayable",
  inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
  outputs: [{ name: "", type: "bool" }],
}] as const;

export function buildBrowserActivationCalls(quote: SignedQuote, disputeWindow: bigint, now: number) {
  if (quote.chainId !== BSC_TESTNET_PROTOCOL.chainId) throw new Error("Quote must target BSC testnet");
  if (getAddress(quote.commerce) !== getAddress(BSC_TESTNET_PROTOCOL.commerce)) throw new Error("Unexpected commerce contract");
  if (getAddress(quote.paymentToken) !== getAddress(BSC_TESTNET_PROTOCOL.paymentToken)) throw new Error("Unexpected payment token");
  if (!Number.isSafeInteger(now) || now <= 0) throw new Error("Invalid activation time");
  if (disputeWindow <= 0n) throw new Error("Invalid dispute window");
  const amount = BigInt(quote.amount);
  if (amount <= 0n) throw new Error("Invalid quote amount");
  const emptyJobId = 0n;
  const expiredAt = BigInt(now) + disputeWindow + 7_200n;

  return {
    createJob: {
      address: BSC_TESTNET_PROTOCOL.commerce,
      abi: commerceBrowserAbi,
      functionName: "createJob" as const,
      args: [
        getAddress(quote.provider),
        BSC_TESTNET_PROTOCOL.evaluatorRouter,
        expiredAt,
        createJobDescription(quote),
        BSC_TESTNET_PROTOCOL.evaluatorRouter,
      ] as const,
    },
    registerJob: {
      address: BSC_TESTNET_PROTOCOL.evaluatorRouter,
      abi: routerBrowserAbi,
      functionName: "registerJob" as const,
      args: [emptyJobId, BSC_TESTNET_PROTOCOL.optimisticPolicy] as const,
    },
    setBudget: {
      address: BSC_TESTNET_PROTOCOL.commerce,
      abi: commerceBrowserAbi,
      functionName: "setBudget" as const,
      args: [emptyJobId, amount, "0x"] as const,
    },
    approve: {
      address: BSC_TESTNET_PROTOCOL.paymentToken,
      abi: erc20ApprovalAbi,
      functionName: "approve" as const,
      args: [BSC_TESTNET_PROTOCOL.commerce, amount] as const,
    },
    fund: {
      address: BSC_TESTNET_PROTOCOL.commerce,
      abi: commerceBrowserAbi,
      functionName: "fund" as const,
      args: [emptyJobId, amount, "0x"] as const,
    },
    settle: {
      address: BSC_TESTNET_PROTOCOL.evaluatorRouter,
      abi: routerBrowserAbi,
      functionName: "settle" as const,
      args: [emptyJobId, "0x"] as const,
    },
  };
}

export function nextBrowserActivationAction(receipt: BrowserActivationReceipt): BrowserActivationAction {
  switch (receipt.stage) {
    case "quoted": return "createJob";
    case "open": return "registerJob";
    case "registered": return "setBudget";
    case "budgeted": return "approve";
    case "approved": return "fund";
    case "funded": return "notifySeller";
    case "submitted": return "waitToSettle";
    case "completed": return "complete";
    case "failed": return "recover";
  }
}

export function parseCreatedJobId(logs: ReadonlyArray<{ address: Address; data: Hex; topics: readonly Hex[] }>): bigint {
  for (const log of logs) {
    if (getAddress(log.address) !== getAddress(BSC_TESTNET_PROTOCOL.commerce)) continue;
    try {
      const decoded = decodeEventLog({
        abi: jobCreatedEvent,
        eventName: "JobCreated",
        data: log.data,
        topics: log.topics as [Hex, ...Hex[]],
      });
      if (decoded.eventName === "JobCreated") return decoded.args.jobId;
    } catch {
      // Ignore unrelated logs emitted by the commerce transaction.
    }
  }
  throw new Error("Confirmed createJob receipt contained no JobCreated event");
}
