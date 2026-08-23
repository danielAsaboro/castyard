import { describe, expect, it } from "vitest";

import capturedAgents from "@/features/agents/sources/fixtures/8004scan-category-agents.json";
import { normalize8004Agent } from "@/features/agents/sources/8004scan";
import { qualifyAgent } from "@/features/agents/qualify";
import { parseCatalogueQuery } from "./query";
import { queryCatalogue } from "./search";

const agents = capturedAgents.map((record) => qualifyAgent(normalize8004Agent(record)));

describe("catalogue search", () => {
  it("normalizes punctuation and honors quoted English phrases", () => {
    const result = queryCatalogue(agents, parseCatalogueQuery({ q: '"grid trading"' }));

    expect(result.total).toBe(1);
    expect(result.items[0].agent.identity.name).toBe("GridMaster Ops (Agent Studio)");
    expect(result.items[0].matchReason).toContain("grid trading");
  });

  it("matches common English inflections and British spelling", () => {
    const result = queryCatalogue(agents, parseCatalogueQuery({ q: "optimising yields" }));

    expect(result.items.map(({ agent }) => agent.identity.name)).toEqual([
      "positioncrew-yield-optimizer.agent",
    ]);
  });

  it("combines category, network, evidence, and payment-rail facets", () => {
    const observed = agents.map((agent, index) => index === 0
      ? { ...agent, evidenceState: "observed" as const }
      : agent);
    const result = queryCatalogue(observed, parseCatalogueQuery({
      category: "grid-trading",
      network: "mainnet",
      evidence: "observed",
      rail: "x402",
    }));

    expect(result.total).toBe(1);
    expect(result.items[0].agent.identity.erc8004AgentTokenId).toBe("267697");
  });

  it("uses verified service activation rails without rewriting registry protocols", () => {
    const erc8183Agent = { ...agents[0], activationRails: ["erc8183" as const] };
    const result = queryCatalogue([erc8183Agent, ...agents.slice(1)], parseCatalogueQuery({ rail: "erc8183" }));

    expect(result.items.map(({ agent }) => agent.identity.agentId)).toEqual([erc8183Agent.identity.agentId]);
    expect(erc8183Agent.identity.supportedProtocols).not.toContain("ERC-8183");
  });

  it("uses canonical identity as a stable tie-breaker", () => {
    const result = queryCatalogue(agents, parseCatalogueQuery({ q: "positioncrew" }));

    expect(result.items.map(({ agent }) => agent.identity.agentId)).toEqual([
      "56:0x8004a169fb4a3325136eb29fa0ceb6d2e539a432:266229",
      "56:0x8004a169fb4a3325136eb29fa0ceb6d2e539a432:266232",
    ]);
  });

  it("reports stable page metadata and clamps an out-of-range page", () => {
    const result = queryCatalogue(agents, parseCatalogueQuery({ page: "99", perPage: "12" }));

    expect(result).toMatchObject({ total: 3, page: 1, perPage: 12, pageCount: 1, from: 1, to: 3 });
    expect(result.items).toHaveLength(3);
  });

  it("sorts names without changing evidence meaning", () => {
    const result = queryCatalogue(agents, parseCatalogueQuery({ sort: "name" }));

    expect(result.items.map(({ agent }) => agent.identity.name)).toEqual([
      "GridMaster Ops (Agent Studio)",
      "positioncrew-lending-rescue.agent",
      "positioncrew-yield-optimizer.agent",
    ]);
    expect(result.items.every(({ agent }) => agent.evidenceState === "claimed")).toBe(true);
  });
});
