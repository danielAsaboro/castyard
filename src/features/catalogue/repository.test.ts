import { describe, expect, it } from "vitest";

import { parseCatalogueQuery } from "./query";
import { buildCatalogueStatements, isCatalogueRefreshDue, toFtsQuery } from "./repository";

describe("D1 catalogue repository queries", () => {
  it("does not schedule another full upstream crawl inside the fifteen-minute freshness window", () => {
    const startedAt = "2026-09-04T19:20:00.000Z";

    expect(isCatalogueRefreshDue(startedAt, Date.parse("2026-09-04T19:34:59.999Z"))).toBe(false);
    expect(isCatalogueRefreshDue(startedAt, Date.parse("2026-09-04T19:35:00.000Z"))).toBe(true);
    expect(isCatalogueRefreshDue(undefined, Date.parse("2026-09-04T19:20:00.000Z"))).toBe(true);
  });

  it("compiles ordinary English and quoted phrases into bounded FTS syntax", () => {
    expect(toFtsQuery('live "grid trading" agents')).toBe('"live"* AND "grid trading" AND "agents"*');
    expect(toFtsQuery('" OR current = 1 --')).toBe('"or"* AND "current"* AND "1"*');
  });

  it("binds user values instead of interpolating them into SQL", () => {
    const malicious = 'yield" OR 1=1 --';
    const statements = buildCatalogueStatements(parseCatalogueQuery({
      q: malicious,
      category: ["yield-optimisation", "rebalancing"],
      network: "mainnet",
      evidence: "claimed",
      rail: "x402",
      sort: "freshness",
      page: "2",
      perPage: "12",
    }));

    expect(statements.rows.sql).not.toContain(malicious);
    expect(statements.count.sql).not.toContain(malicious);
    expect(statements.rows.sql).toContain("agents_fts MATCH ?");
    expect(statements.rows.sql).toContain("LIMIT ? OFFSET ?");
    expect(statements.rows.bindings).toContain("mainnet");
    expect(statements.rows.bindings.at(-2)).toBe(12);
    expect(statements.rows.bindings.at(-1)).toBe(12);
  });

  it("uses only whitelisted order expressions", () => {
    const byName = buildCatalogueStatements(parseCatalogueQuery({ sort: "name" }));
    const byEvidence = buildCatalogueStatements(parseCatalogueQuery({ sort: "evidence" }));

    expect(byName.rows.sql).toContain("a.normalized_name ASC");
    expect(byEvidence.rows.sql).toContain("a.evidence_rank DESC");
    expect(byName.rows.sql).toContain("a.agent_id ASC");
    expect(byEvidence.rows.sql).toContain("a.agent_id ASC");
  });
});
