import { describe, expect, it } from "vitest";

import { buildAcquireStatement, ReferenceSellerRepository } from "./repository";

describe("reference seller D1 repository", () => {
  it("atomically binds job and nonce and only reclaims failed or stale work", () => {
    const statement = buildAcquireStatement("7", `0x${"12".repeat(32)}`, "2026-08-17T16:00:00.000Z", "2026-08-17T15:55:00.000Z");
    expect(statement.sql).toContain("ON CONFLICT(job_id) DO UPDATE");
    expect(statement.sql).toContain("state = 'failed'");
    expect(statement.sql).toContain("updated_at <= ?");
    expect(statement.sql).not.toContain(statement.bindings[1]);
    expect(statement.bindings).toEqual(["7", `0x${"12".repeat(32)}`, "2026-08-17T16:00:00.000Z", "2026-08-17T16:00:00.000Z", "2026-08-17T15:55:00.000Z"]);
  });

  it("reports whether a D1 claim changed a row", async () => {
    const db = {
      prepare: () => ({
        bind() { return this; },
        first: async () => null,
        all: async () => ({ success: true, results: [] }),
        run: async () => ({ success: true, meta: { changes: 1 } }),
      }),
      batch: async () => [],
    };
    const repository = new ReferenceSellerRepository(db);
    await expect(repository.acquire(7n, `0x${"12".repeat(32)}`, new Date("2026-08-17T16:00:00Z"))).resolves.toBe(true);
  });
});
