import { decodeEventLog, formatUnits, getAddress, type Address, type Hex } from "viem";

import { BSC_TESTNET_PROTOCOL } from "./contracts";
import { createJobDescription, verifySignedQuote, type SignedQuote } from "./quote";

export type BrowserActivationStage =
  | "quoted"
  | "open"
  | "registered"
  | "budgeted"
  | "approved"
  | "funded"
  | "submitted"
  | "completed"
  | "cancelled"
  | "refundClaimed"
  | "refunded"
  | "failed";

export type BrowserActivationTransaction =
  | "createJob"
  | "registerJob"
  | "setBudget"
  | "approve"
  | "fund"
  | "submit"
  | "settle"
  | "cancel"
  | "claimRefund"
  | "markExpired";

export interface BrowserActivationReceipt {
  version: 1;
  quote: SignedQuote;
  buyer: Address;
  stage: BrowserActivationStage;
  jobId?: string;
  expiredAt?: string;
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

export type BrowserContractCall = {
  address: Address;
  abi: readonly unknown[];
  functionName: string;
  args: readonly unknown[];
};

export type BrowserConfirmedWrite = {
  transactionHash: Hex;
  logs: ReadonlyArray<{ address: Address; data: Hex; topics: readonly Hex[] }>;
};

export type BrowserSellerSubmission = {
  transactionHash: Hex;
  deliverableHash: Hex;
  deliverable: unknown;
  submittedAt: bigint;
};

export type BrowserOnchainJob = {
  id: bigint;
  client: Address;
  provider: Address;
  evaluator: Address;
  description: string;
  budget: bigint;
  expiredAt: bigint;
  status: number;
  hook: Address;
  submittedAt: bigint;
  deliverable: Hex;
};

export interface BrowserActivationDependencies {
  now(): number;
  buyer: Address;
  expectedProvider: Address;
  readDisputeWindow(): Promise<bigint>;
  readTokenBalance(buyer: Address): Promise<bigint>;
  readTokenAllowance(buyer: Address, spender: Address): Promise<bigint>;
  readJob(jobId: bigint): Promise<BrowserOnchainJob>;
  write(call: BrowserContractCall): Promise<BrowserConfirmedWrite>;
  notifySeller(jobId: bigint, quote: SignedQuote): Promise<BrowserSellerSubmission>;
}

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
    name: "reject",
    stateMutability: "nonpayable",
    inputs: [
      { name: "jobId", type: "uint256" },
      { name: "reason", type: "bytes32" },
      { name: "optParams", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "claimRefund",
    stateMutability: "nonpayable",
    inputs: [{ name: "jobId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "getJob",
    stateMutability: "view",
    inputs: [{ name: "jobId", type: "uint256" }],
    outputs: [{
      name: "",
      type: "tuple",
      components: [
        { name: "id", type: "uint256" },
        { name: "client", type: "address" },
        { name: "provider", type: "address" },
        { name: "evaluator", type: "address" },
        { name: "description", type: "string" },
        { name: "budget", type: "uint256" },
        { name: "expiredAt", type: "uint256" },
        { name: "status", type: "uint8" },
        { name: "hook", type: "address" },
        { name: "submittedAt", type: "uint256" },
        { name: "deliverable", type: "bytes32" },
      ],
    }],
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
  {
    type: "function",
    name: "markExpired",
    stateMutability: "nonpayable",
    inputs: [{ name: "jobId", type: "uint256" }],
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
    cancel: {
      address: BSC_TESTNET_PROTOCOL.commerce,
      abi: commerceBrowserAbi,
      functionName: "reject" as const,
      args: [emptyJobId, `0x${"00".repeat(32)}` as Hex, "0x"] as const,
    },
    claimRefund: {
      address: BSC_TESTNET_PROTOCOL.commerce,
      abi: commerceBrowserAbi,
      functionName: "claimRefund" as const,
      args: [emptyJobId] as const,
    },
    markExpired: {
      address: BSC_TESTNET_PROTOCOL.evaluatorRouter,
      abi: routerBrowserAbi,
      functionName: "markExpired" as const,
      args: [emptyJobId] as const,
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
    case "cancelled": return "complete";
    case "refundClaimed": return "recover";
    case "refunded": return "complete";
    case "failed": return "recover";
  }
}

function requireJobId(receipt: BrowserActivationReceipt): bigint {
  if (!receipt.jobId || !/^[1-9][0-9]{0,77}$/.test(receipt.jobId)) {
    throw new Error("Activation receipt has no valid ERC-8183 job ID");
  }
  return BigInt(receipt.jobId);
}

function bindJobId(call: BrowserContractCall, jobId: bigint): BrowserContractCall {
  return { ...call, args: [jobId, ...call.args.slice(1)] };
}

function progressed(
  receipt: BrowserActivationReceipt,
  now: number,
  patch: Partial<BrowserActivationReceipt>,
): BrowserActivationReceipt {
  return {
    ...receipt,
    ...patch,
    transactions: { ...receipt.transactions, ...patch.transactions },
    error: undefined,
    updatedAt: new Date(now * 1_000).toISOString(),
  };
}

function validateOnchainJob(
  job: BrowserOnchainJob,
  receipt: BrowserActivationReceipt,
  jobId: bigint,
  now: number,
  expectedStatus: number,
  requireBudget: boolean,
  requireUnexpired = true,
) {
  if (job.id !== jobId) throw new Error("On-chain ERC-8183 job ID does not match the receipt");
  if (getAddress(job.client) !== getAddress(receipt.buyer)) throw new Error("On-chain ERC-8183 client does not match the receipt buyer");
  if (getAddress(job.provider) !== getAddress(receipt.quote.provider)) throw new Error("On-chain ERC-8183 provider does not match the signed quote");
  if (getAddress(job.evaluator) !== getAddress(BSC_TESTNET_PROTOCOL.evaluatorRouter)) throw new Error("On-chain ERC-8183 evaluator is not the approved router");
  if (getAddress(job.hook) !== getAddress(BSC_TESTNET_PROTOCOL.evaluatorRouter)) throw new Error("On-chain ERC-8183 hook is not the approved router");
  if (job.description !== createJobDescription(receipt.quote)) throw new Error("On-chain ERC-8183 description commitment does not match the signed quote");
  if (requireUnexpired && job.expiredAt <= BigInt(now)) throw new Error("On-chain ERC-8183 job has expired");
  if (job.status !== expectedStatus) throw new Error(`On-chain ERC-8183 status is ${job.status}, expected ${expectedStatus}`);
  if (requireBudget && job.budget !== BigInt(receipt.quote.amount)) {
    throw new Error("On-chain ERC-8183 budget does not match the signed quote");
  }
  if (expectedStatus === 2 && receipt.deliverableHash
    && job.deliverable.toLowerCase() !== receipt.deliverableHash.toLowerCase()) {
    throw new Error("On-chain ERC-8183 deliverable does not match the receipt");
  }
}

export async function advanceBrowserActivation(
  receipt: BrowserActivationReceipt,
  dependencies: BrowserActivationDependencies,
): Promise<BrowserActivationReceipt> {
  const now = dependencies.now();
  if (!Number.isSafeInteger(now) || now <= 0) throw new Error("Invalid activation time");
  if (getAddress(dependencies.buyer) !== getAddress(receipt.buyer)) {
    throw new Error("Connected wallet does not match the activation receipt buyer");
  }
  const action = nextBrowserActivationAction(receipt);

  if (["createJob", "registerJob", "setBudget", "approve", "fund", "notifySeller"].includes(action)) {
    await verifySignedQuote(receipt.quote, {
      expectedProvider: dependencies.expectedProvider,
      now,
      usedNonces: new Set(),
    });
  }

  const disputeWindow = await dependencies.readDisputeWindow();
  const calls = buildBrowserActivationCalls(receipt.quote, disputeWindow, now);

  if (action === "createJob") {
    const balance = await dependencies.readTokenBalance(receipt.buyer);
    const amount = BigInt(receipt.quote.amount);
    if (balance < amount) {
      throw new Error(`Buyer needs at least ${formatUnits(amount, 18)} U before creating a job`);
    }
    const result = await dependencies.write(calls.createJob);
    const jobId = parseCreatedJobId(result.logs);
    const job = await dependencies.readJob(jobId);
    validateOnchainJob(job, receipt, jobId, now, 0, false);
    return progressed(receipt, now, {
      stage: "open",
      jobId: jobId.toString(),
      expiredAt: job.expiredAt.toString(),
      transactions: { createJob: result.transactionHash },
    });
  }

  if (action === "registerJob") {
    const jobId = requireJobId(receipt);
    validateOnchainJob(await dependencies.readJob(jobId), receipt, jobId, now, 0, false);
    const result = await dependencies.write(bindJobId(calls.registerJob, jobId));
    return progressed(receipt, now, {
      stage: "registered",
      transactions: { registerJob: result.transactionHash },
    });
  }

  if (action === "setBudget") {
    const jobId = requireJobId(receipt);
    validateOnchainJob(await dependencies.readJob(jobId), receipt, jobId, now, 0, false);
    const result = await dependencies.write(bindJobId(calls.setBudget, jobId));
    return progressed(receipt, now, {
      stage: "budgeted",
      transactions: { setBudget: result.transactionHash },
    });
  }

  if (action === "approve") {
    const jobId = requireJobId(receipt);
    validateOnchainJob(await dependencies.readJob(jobId), receipt, jobId, now, 0, true);
    const allowance = await dependencies.readTokenAllowance(receipt.buyer, BSC_TESTNET_PROTOCOL.commerce);
    if (allowance >= BigInt(receipt.quote.amount)) {
      return progressed(receipt, now, { stage: "approved" });
    }
    const result = await dependencies.write(calls.approve);
    return progressed(receipt, now, {
      stage: "approved",
      transactions: { approve: result.transactionHash },
    });
  }

  if (action === "fund") {
    const jobId = requireJobId(receipt);
    validateOnchainJob(await dependencies.readJob(jobId), receipt, jobId, now, 0, true);
    const result = await dependencies.write(bindJobId(calls.fund, jobId));
    return progressed(receipt, now, {
      stage: "funded",
      transactions: { fund: result.transactionHash },
    });
  }

  if (action === "notifySeller") {
    const jobId = requireJobId(receipt);
    validateOnchainJob(await dependencies.readJob(jobId), receipt, jobId, now, 1, true);
    const result = await dependencies.notifySeller(jobId, receipt.quote);
    return progressed(receipt, now, {
      stage: "submitted",
      deliverableHash: result.deliverableHash,
      deliverable: result.deliverable,
      settleAfter: (result.submittedAt + disputeWindow).toString(),
      transactions: { submit: result.transactionHash },
    });
  }

  if (action === "waitToSettle") {
    const settleAfter = BigInt(receipt.settleAfter ?? "0");
    if (settleAfter <= 0n) throw new Error("Activation receipt has no valid settlement time");
    if (BigInt(now) <= settleAfter) throw new Error(`Dispute window is still open until unix ${settleAfter}`);
    const jobId = requireJobId(receipt);
    validateOnchainJob(await dependencies.readJob(jobId), receipt, jobId, now, 2, true);
    const result = await dependencies.write(bindJobId(calls.settle, jobId));
    return progressed(receipt, now, {
      stage: "completed",
      transactions: { settle: result.transactionHash },
    });
  }

  if (action === "complete") return receipt;
  throw new Error("Failed activation receipt requires authoritative recovery before another write");
}

async function verifyHistoricalReceipt(receipt: BrowserActivationReceipt, dependencies: BrowserActivationDependencies, now: number) {
  if (getAddress(dependencies.buyer) !== getAddress(receipt.buyer)) {
    throw new Error("Connected wallet does not match the activation receipt buyer");
  }
  await verifySignedQuote(receipt.quote, {
    expectedProvider: dependencies.expectedProvider,
    now: Math.min(now, receipt.quote.expiresAt),
    usedNonces: new Set(),
  });
}

export async function cancelOpenBrowserActivation(
  receipt: BrowserActivationReceipt,
  dependencies: BrowserActivationDependencies,
): Promise<BrowserActivationReceipt> {
  if (!["open", "registered", "budgeted", "approved"].includes(receipt.stage)) {
    throw new Error("Only an unfunded open job can be cancelled");
  }
  const now = dependencies.now();
  await verifyHistoricalReceipt(receipt, dependencies, now);
  const jobId = requireJobId(receipt);
  const job = await dependencies.readJob(jobId);
  validateOnchainJob(job, receipt, jobId, now, 0, false, false);
  const calls = buildBrowserActivationCalls(receipt.quote, await dependencies.readDisputeWindow(), Math.max(1, now));
  const result = await dependencies.write(bindJobId(calls.cancel, jobId));
  return progressed(receipt, now, { stage: "cancelled", transactions: { cancel: result.transactionHash } });
}

export async function claimExpiredBrowserActivationRefund(
  receipt: BrowserActivationReceipt,
  dependencies: BrowserActivationDependencies,
): Promise<BrowserActivationReceipt> {
  if (receipt.stage !== "funded") throw new Error("Only a funded, undelivered job can use this refund path");
  const now = dependencies.now();
  await verifyHistoricalReceipt(receipt, dependencies, now);
  const jobId = requireJobId(receipt);
  const job = await dependencies.readJob(jobId);
  validateOnchainJob(job, receipt, jobId, now, 1, true, false);
  if (BigInt(now) <= job.expiredAt) throw new Error(`Job refund unlocks after unix ${job.expiredAt}`);
  const calls = buildBrowserActivationCalls(receipt.quote, await dependencies.readDisputeWindow(), Math.max(1, now));
  const result = await dependencies.write(bindJobId(calls.claimRefund, jobId));
  return progressed(receipt, now, { stage: "refundClaimed", transactions: { claimRefund: result.transactionHash } });
}

export async function reconcileExpiredBrowserActivation(
  receipt: BrowserActivationReceipt,
  dependencies: BrowserActivationDependencies,
): Promise<BrowserActivationReceipt> {
  if (receipt.stage !== "refundClaimed") throw new Error("Claim the expired escrow refund before router reconciliation");
  const now = dependencies.now();
  await verifyHistoricalReceipt(receipt, dependencies, now);
  const jobId = requireJobId(receipt);
  const job = await dependencies.readJob(jobId);
  validateOnchainJob(job, receipt, jobId, now, 5, true, false);
  const calls = buildBrowserActivationCalls(receipt.quote, await dependencies.readDisputeWindow(), Math.max(1, now));
  const result = await dependencies.write(bindJobId(calls.markExpired, jobId));
  return progressed(receipt, now, { stage: "refunded", transactions: { markExpired: result.transactionHash } });
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
