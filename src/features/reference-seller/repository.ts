import type { Hex } from "viem";

import type { D1DatabaseLike } from "@/features/catalogue/repository";
import type { DeliverableRecord } from "./provider";

export function buildAcquireStatement(jobId: string, quoteNonce: Hex, now: string, staleBefore: string) {
  return {
    sql: `INSERT INTO reference_seller_jobs (
      job_id, quote_nonce, state, created_at, updated_at
    ) VALUES (?, ?, 'processing', ?, ?)
    ON CONFLICT(job_id) DO UPDATE SET
      quote_nonce = excluded.quote_nonce,
      state = 'processing',
      deliverable_json = NULL,
      deliverable_hash = NULL,
      transaction_hash = NULL,
      receipt_block_number = NULL,
      error_message = NULL,
      updated_at = excluded.updated_at
    WHERE reference_seller_jobs.state = 'failed'
       OR (reference_seller_jobs.state = 'processing' AND reference_seller_jobs.updated_at <= ?)`,
    bindings: [jobId, quoteNonce, now, now, staleBefore],
  };
}

export type ReferenceSellerJobRow = {
  job_id: string;
  quote_nonce: string;
  state: "processing" | "executed" | "submitted" | "failed";
  deliverable_json: string | null;
  deliverable_hash: string | null;
  transaction_hash: string | null;
  receipt_block_number: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export class ReferenceSellerRepository {
  constructor(private readonly db: D1DatabaseLike) {}

  async acquire(jobId: bigint, quoteNonce: Hex, at = new Date()): Promise<boolean> {
    const now = at.toISOString();
    const staleBefore = new Date(at.getTime() - 5 * 60_000).toISOString();
    const statement = buildAcquireStatement(jobId.toString(), quoteNonce, now, staleBefore);
    try {
      const result = await this.db.prepare(statement.sql).bind(...statement.bindings).run();
      return result.success && (result.meta?.changes ?? 0) > 0;
    } catch {
      return false;
    }
  }

  async saveDeliverable(record: DeliverableRecord, at = new Date()): Promise<void> {
    const result = await this.db.prepare(`UPDATE reference_seller_jobs SET
      state = ?, deliverable_json = ?, deliverable_hash = ?, transaction_hash = ?,
      receipt_block_number = ?, error_message = NULL, updated_at = ?
      WHERE job_id = ? AND quote_nonce = ?`)
      .bind(record.state, record.deliverableJson, record.deliverableHash, record.transactionHash ?? null,
        record.receiptBlockNumber ?? null, at.toISOString(), record.jobId, record.quoteNonce)
      .run();
    if (!result.success || (result.meta?.changes ?? 0) !== 1) throw new Error("Failed to persist reference seller deliverable");
  }

  async saveFailure(jobId: bigint, quoteNonce: Hex, message: string, at = new Date()): Promise<void> {
    await this.db.prepare(`UPDATE reference_seller_jobs SET
      state = 'failed', error_message = ?, updated_at = ?
      WHERE job_id = ? AND quote_nonce = ? AND state != 'submitted'`)
      .bind(message.slice(0, 1_000), at.toISOString(), jobId.toString(), quoteNonce)
      .run();
  }

  async get(jobId: bigint): Promise<ReferenceSellerJobRow | null> {
    return this.db.prepare(`SELECT job_id, quote_nonce, state, deliverable_json, deliverable_hash,
      transaction_hash, receipt_block_number, error_message, created_at, updated_at
      FROM reference_seller_jobs WHERE job_id = ?`)
      .bind(jobId.toString())
      .first<ReferenceSellerJobRow>();
  }
}
