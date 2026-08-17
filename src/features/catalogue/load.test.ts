import { describe, expect, it } from "vitest";

import capturedAgents from "@/features/agents/sources/fixtures/8004scan-category-agents.json";
import { normalize8004Agent } from "@/features/agents/sources/8004scan";
import { qualifyAgent } from "@/features/agents/qualify";
import { parseCatalogueQuery } from "./query";
import { loadCatalogue } from "./load";
import { queryCatalogue } from "./search";

const agents = capturedAgents.map((record) => qualifyAgent(normalize8004Agent(record)));

describe("catalogue loading", () => {
  it("uses the durable index when it contains current records", async () => {
    const query = parseCatalogueQuery({ q: "grid" });
    const indexed = queryCatalogue(agents, query);
    const result = await loadCatalogue(query, {
      repository: { currentCount: async () => 3, search: async () => indexed },
      fallback: async () => { throw new Error("fallback must not run"); },
    });

    expect(result.source).toBe("index");
    expect(result.page).toBe(indexed);
  });

  it("does not relabel an incomplete durable refresh as current", async () => {
    const query = parseCatalogueQuery({ q: "grid" });
    const indexed = queryCatalogue(agents, query);
    const result = await loadCatalogue(query, {
      repository: {
        currentCount: async () => 3,
        currentComplete: async () => false,
        search: async () => indexed,
      },
      fallback: async () => { throw new Error("fallback must not run"); },
    });

    expect(result.source).toBe("index-partial");
  });

  it("uses current registry records while a new durable index is empty", async () => {
    const query = parseCatalogueQuery({ q: "grid" });
    const result = await loadCatalogue(query, {
      repository: { currentCount: async () => 0, search: async () => { throw new Error("empty index must not be searched"); } },
      fallback: async () => ({ agents, coverage: [], complete: true }),
    });

    expect(result.source).toBe("live-bootstrap");
    expect(result.page.total).toBe(1);
  });

  it("seeds an empty durable index from complete current marketplace coverage", async () => {
    const query = parseCatalogueQuery({ q: "grid" });
    const indexed = queryCatalogue(agents, query);
    let seeded = 0;
    const result = await loadCatalogue(query, {
      repository: {
        currentCount: async () => 0,
        replaceSyncSnapshot: async (snapshot) => { seeded = snapshot.agents.length; return "sync-id"; },
        search: async () => indexed,
      },
      fallback: async () => ({ agents, coverage: [], complete: true }),
    });

    expect(seeded).toBe(3);
    expect(result.source).toBe("index");
    expect(result.page).toBe(indexed);
  });

  it("falls back to current registry records when D1 is unavailable", async () => {
    const query = parseCatalogueQuery({ category: "yield-optimisation" });
    const result = await loadCatalogue(query, {
      repository: undefined,
      fallback: async () => ({ agents, coverage: [], complete: true }),
    });

    expect(result.source).toBe("live-bootstrap");
    expect(result.page.items[0].agent.identity.erc8004AgentTokenId).toBe("266232");
  });
});
