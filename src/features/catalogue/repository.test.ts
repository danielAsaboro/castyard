import { describe, expect, it } from "vitest";

import { parseCatalogueQuery } from "./query";
import { buildCatalogueStatements, toFtsQuery } from "./repository";

describe("D1 catalogue repository queries", () => {
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
