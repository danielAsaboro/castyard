import { describe, expect, it } from "vitest";

import rebalancer from "@/features/agents/sources/fixtures/8004scan-rebalancer.json";
import categoryAgents from "@/features/agents/sources/fixtures/8004scan-category-agents.json";
import { loadMarketplaceInventory } from "./inventory";

const records: Record<string, unknown[]> = {
  rebalancing: rebalancer.data,
  "grid trading": [categoryAgents[0]],
  "yield optimization": [categoryAgents[1]],
  "yield optimisation": [categoryAgents[1]],
  "health factor": [categoryAgents[2]],
};

function response(data: unknown[]): Response {
  return new Response(JSON.stringify({
    success: true,
    data,
    meta: {
      timestamp: "2026-08-17T00:00:00Z",
      requestId: "marketplace-inventory",
      pagination: { page: 1, limit: 50, total: data.length, hasMore: false },
    },
  }), { status: 200 });
}

describe("judged marketplace inventory", () => {
  it("indexes every category search on mainnet and testnet and deduplicates identities", async () => {
    const requests: string[] = [];
    const fetcher: typeof fetch = async (input) => {
      const url = new URL(String(input));
      const chainId = url.searchParams.get("chainId") ?? "";
      const search = url.searchParams.get("search") ?? "";
      requests.push(`${chainId}:${search}`);
      return response(chainId === "56" ? records[search] ?? [] : []);
    };

    const result = await loadMarketplaceInventory(fetcher);

    expect(requests).toHaveLength(10);
    expect(result.agents).toHaveLength(4);
    expect(result.complete).toBe(true);
    expect(result.agents.every((agent) => agent.categoryClaims.length > 0)).toBe(true);
  });

  it("retains successful records and reports an incomplete refresh", async () => {
    const fetcher: typeof fetch = async (input) => {
      const url = new URL(String(input));
      if (url.searchParams.get("chainId") === "97" && url.searchParams.get("search") === "grid trading") {
        return new Response("unavailable", { status: 503 });
      }
      return response(url.searchParams.get("chainId") === "56" ? records[url.searchParams.get("search") ?? ""] ?? [] : []);
    };

    const result = await loadMarketplaceInventory(fetcher);

    expect(result.agents).toHaveLength(4);
    expect(result.complete).toBe(false);
    expect(result.coverage.some((entry) => entry.status === "partial")).toBe(true);
  });
});
