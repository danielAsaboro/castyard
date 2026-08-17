import { env } from "cloudflare:workers";
import { isHex } from "viem";

import { ensureCatalogueSchema, getReferenceSellerRepository } from "../../../../../../db";
import type { SignedQuote } from "@/features/activation/quote";
import { processFundedJob } from "@/features/reference-seller/provider";
import { createReferenceSellerRuntime } from "@/features/reference-seller/runtime";
import { executeReferenceSkill } from "@/features/reference-seller/skills/execute";

export const dynamic = "force-dynamic";

function parseJobId(value: string): bigint {
  if (!/^[1-9][0-9]{0,77}$/.test(value)) throw new Error("Invalid ERC-8183 job ID");
  return BigInt(value);
}

export async function GET(_request: Request, context: { params: Promise<{ jobId: string }> }) {
  try {
    const jobId = parseJobId((await context.params).jobId);
    await ensureCatalogueSchema();
    const record = await getReferenceSellerRepository().get(jobId);
    if (!record) return Response.json({ error: "Job has not been observed by this seller" }, { status: 404 });
    return Response.json({
      jobId: record.job_id,
      state: record.state,
      deliverable: record.deliverable_json ? JSON.parse(record.deliverable_json) : null,
      deliverableHash: record.deliverable_hash,
      transactionHash: record.transaction_hash,
      receiptBlockNumber: record.receipt_block_number,
      error: record.error_message,
      updatedAt: record.updated_at,
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Invalid request" }, { status: 400 });
  }
}

export async function POST(request: Request, context: { params: Promise<{ jobId: string }> }) {
  try {
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 65_536) return Response.json({ error: "Request body too large" }, { status: 413 });
    const jobId = parseJobId((await context.params).jobId);
    const privateKey = env.REFERENCE_SELLER_PRIVATE_KEY;
    if (typeof privateKey !== "string" || !isHex(privateKey, { strict: true }) || privateKey.length !== 66) {
      return Response.json({ error: "Reference seller signing service is unavailable" }, { status: 503 });
    }
    const text = await request.text();
    if (text.length > 65_536) return Response.json({ error: "Request body too large" }, { status: 413 });
    const body = JSON.parse(text) as { quote?: SignedQuote };
    if (!body.quote) throw new Error("Signed quote is required");

    await ensureCatalogueSchema();
    const repository = getReferenceSellerRepository();
    const runtime = createReferenceSellerRuntime(privateKey, typeof env.BSC_TESTNET_RPC_URL === "string" ? env.BSC_TESTNET_RPC_URL : undefined);
    const result = await processFundedJob(jobId, body.quote, {
      now: () => Math.floor(Date.now() / 1000),
      expectedProvider: runtime.account.address,
      usedNonces: new Set(),
      getJob: runtime.getJob,
      acquire: (id, nonce) => repository.acquire(id, nonce),
      execute: (task) => executeReferenceSkill(task, runtime.reader),
      saveDeliverable: (record) => repository.saveDeliverable(record),
      saveFailure: (id, nonce, message) => repository.saveFailure(id, nonce, message),
      submit: runtime.submit,
      waitForReceipt: runtime.waitForReceipt,
    });
    return Response.json(result, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Provider request failed";
    const status = message.includes("already being processed") ? 409 : message.includes("RPC") ? 502 : 400;
    return Response.json({ error: message }, { status, headers: { "cache-control": "no-store" } });
  }
}
