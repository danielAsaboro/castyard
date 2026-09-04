import { describe, expect, it, vi } from "vitest";
import { privateKeyToAccount } from "viem/accounts";

import { createSignedQuote } from "./quote";
import {
  browserActivationReceiptFilename,
  createInitialBrowserReceipt,
  fetchSellerSubmission,
  loadBrowserActivationReceipt,
  saveBrowserActivationReceipt,
  serializeBrowserActivationReceipt,
} from "./browser-wallet";

const agentId = "97:0x8004a818bfb912233c491871b3d84c89a494bd9e:1830";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

async function quote() {
  return createSignedQuote({
    account: privateKeyToAccount(`0x${"11".repeat(32)}`),
    agentId,
    task: {
      skill: "rebalancing",
      parameters: { poolAddress: "0x145ECf200CF4Eb61e61E5E9E73eD63F8643816df", rangeWidthBps: 1_000 },
    },
    amount: 10_000_000_000_000_000n,
    now: 1_000,
    ttlSeconds: 600,
    nonce: `0x${"22".repeat(32)}`,
  });
}

describe("browser activation receipt persistence", () => {
  it("stores the verified quote and exact buyer for refresh recovery", async () => {
    const storage = memoryStorage();
    const receipt = createInitialBrowserReceipt(
      await quote(),
      "0x291db336d8b50c373f05045155c0fa7cdece1451",
      new Date("2026-09-04T00:00:00.000Z"),
    );
    saveBrowserActivationReceipt(receipt, storage);

    expect(loadBrowserActivationReceipt(agentId, storage)).toEqual({
      ...receipt,
      buyer: "0x291DB336D8b50C373F05045155c0fA7CdECe1451",
    });
  });

  it("exports a portable receipt document with a stable evidence filename", async () => {
    const receipt = {
      ...createInitialBrowserReceipt(
        await quote(),
        "0x291db336d8b50c373f05045155c0fa7cdece1451",
        new Date("2026-09-04T00:00:00.000Z"),
      ),
      stage: "open" as const,
      jobId: "42",
      transactions: { createJob: `0x${"aa".repeat(32)}` as const },
    };

    expect(JSON.parse(serializeBrowserActivationReceipt(receipt))).toEqual(receipt);
    expect(browserActivationReceiptFilename(receipt)).toBe("castyard-erc8183-job-42.json");
  });

  it("fails closed for malformed or wrong-agent local data", () => {
    const storage = memoryStorage();
    storage.setItem(`castyard:erc8183:v1:${agentId}`, "{bad");
    expect(loadBrowserActivationReceipt(agentId, storage)).toBeNull();

    storage.setItem(`castyard:erc8183:v1:${agentId}`, JSON.stringify({
      version: 1,
      quote: { agentId: "97:0x0000000000000000000000000000000000000000:1" },
      buyer: "0x291DB336D8b50C373F05045155c0fA7CdECe1451",
      stage: "quoted",
      transactions: {},
      updatedAt: "2026-09-04T00:00:00.000Z",
    }));
    expect(loadBrowserActivationReceipt(agentId, storage)).toBeNull();

    storage.setItem(`castyard:erc8183:v1:${agentId}`, JSON.stringify({
      version: 1,
      quote: { agentId },
      buyer: "0x291DB336D8b50C373F05045155c0fA7CdECe1451",
      stage: "invented-success",
      transactions: { settle: "not-a-hash" },
      updatedAt: "2026-09-04T00:00:00.000Z",
    }));
    expect(loadBrowserActivationReceipt(agentId, storage)).toBeNull();
  });

  it("recovers a submitted seller receipt after an idempotent retry conflict", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "already submitted" }), { status: 409 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        state: "submitted",
        transactionHash: `0x${"aa".repeat(32)}`,
        deliverableHash: `0x${"bb".repeat(32)}`,
        deliverable: { result: "live" },
      }), { status: 200 }));

    await expect(fetchSellerSubmission(42n, await quote(), fetcher)).resolves.toEqual({
      transactionHash: `0x${"aa".repeat(32)}`,
      deliverableHash: `0x${"bb".repeat(32)}`,
      deliverable: { result: "live" },
    });
    expect(fetcher).toHaveBeenNthCalledWith(2, "/api/reference-seller/jobs/42", {
      headers: { "cache-control": "no-cache" },
    });
  });
});
