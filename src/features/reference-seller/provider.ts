import { getAddress, keccak256, toHex, type Address, type Hex } from "viem";

import {
  canonicalJson,
  createJobDescription,
  verifySignedQuote,
  type SignedQuote,
} from "@/features/activation/quote";
import type { SkillResult } from "./skills/execute";

export type CommerceJob = {
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

export type DeliverableRecord = {
  jobId: string;
  quoteNonce: Hex;
  state: "executed" | "submitted";
  deliverableJson: string;
  deliverableHash: Hex;
  transactionHash?: Hex;
  receiptBlockNumber?: string;
};

export type ProviderDependencies = {
  now(): number;
  expectedProvider: Address;
  usedNonces: Set<string>;
  getJob(jobId: bigint): Promise<CommerceJob>;
  acquire(jobId: bigint, quoteNonce: Hex): Promise<boolean>;
  execute(task: SignedQuote["task"]): Promise<SkillResult>;
  saveDeliverable(record: DeliverableRecord): Promise<void>;
  saveFailure(jobId: bigint, quoteNonce: Hex, message: string): Promise<void>;
  submit(jobId: bigint, deliverableHash: Hex): Promise<Hex>;
  waitForReceipt(transactionHash: Hex): Promise<{ status: "success" | "reverted"; blockNumber: bigint }>;
};

export async function processFundedJob(jobId: bigint, quote: SignedQuote, dependencies: ProviderDependencies) {
  const now = dependencies.now();
  const verifiedQuote = await verifySignedQuote(quote, {
    expectedProvider: dependencies.expectedProvider,
    // A confirmed onchain job anchors the signed quote as historical evidence.
    // The authoritative job expiry below still prevents late execution.
    now: Math.min(now, quote.expiresAt),
    usedNonces: dependencies.usedNonces,
  });
  const job = await dependencies.getJob(jobId);

  if (job.id !== jobId) throw new Error("ERC-8183 job ID mismatch");
  if (job.status !== 1) throw new Error("ERC-8183 job is not Funded");
  if (getAddress(job.provider) !== getAddress(dependencies.expectedProvider)) throw new Error("ERC-8183 job provider mismatch");
  if (job.budget !== BigInt(verifiedQuote.amount)) throw new Error("ERC-8183 job budget does not match signed quote");
  if (job.expiredAt <= BigInt(now)) throw new Error("ERC-8183 job is expired");
  if (job.description !== createJobDescription(verifiedQuote)) throw new Error("ERC-8183 job description commitment mismatch");

  if (!await dependencies.acquire(jobId, verifiedQuote.nonce)) {
    throw new Error("ERC-8183 job is already being processed or was submitted");
  }

  try {
    const result = await dependencies.execute(verifiedQuote.task);
    const deliverableJson = canonicalJson({
      version: 1,
      jobId: jobId.toString(),
      quoteNonce: verifiedQuote.nonce,
      taskCommitment: verifiedQuote.taskCommitment,
      result,
    });
    const deliverableHash = keccak256(toHex(deliverableJson));
    const baseRecord = {
      jobId: jobId.toString(),
      quoteNonce: verifiedQuote.nonce,
      deliverableJson,
      deliverableHash,
    };
    await dependencies.saveDeliverable({ ...baseRecord, state: "executed" });

    const transactionHash = await dependencies.submit(jobId, deliverableHash);
    const receipt = await dependencies.waitForReceipt(transactionHash);
    if (receipt.status !== "success") throw new Error("ERC-8183 submit transaction reverted");

    const receiptBlockNumber = receipt.blockNumber.toString();
    await dependencies.saveDeliverable({
      ...baseRecord,
      state: "submitted",
      transactionHash,
      receiptBlockNumber,
    });
    dependencies.usedNonces.add(verifiedQuote.nonce);

    return {
      jobId: jobId.toString(),
      deliverableHash,
      transactionHash,
      receiptBlockNumber,
      deliverable: JSON.parse(deliverableJson) as unknown,
    };
  } catch (error) {
    await dependencies.saveFailure(jobId, verifiedQuote.nonce, error instanceof Error ? error.message : "Provider execution failed");
    throw error;
  }
}
