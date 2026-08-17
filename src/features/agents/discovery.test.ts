import { describe, expect, it } from "vitest";

import capturedRebalancer from "./sources/fixtures/8004scan-rebalancer.json";
import categoryAgents from "./sources/fixtures/8004scan-category-agents.json";
import { loadDiscovery } from "./discovery";

const bySearch: Record<string, unknown[]> = {
  rebalancing: capturedRebalancer.data,
  "grid trading": [categoryAgents[0]],
  "yield optimization": [categoryAgents[1]],
  "health factor": [categoryAgents[2]],
};

function registryFetcher(
  overrides: Partial<Record<string, { status?: number; data?: unknown[] }>> = {},
  searches: string[] = [],
): typeof fetch {
  return async (input) => {
    const url = new URL(String(input));
    const search = url.searchParams.get("search") ?? "";
    searches.push(search);
    const override = overrides[search];
    if (override?.status) {
      return new Response("limited", {
        status: override.status,
        headers: override.status === 429 ? { "retry-after": "60" } : undefined,
      });
    }
    const data = override?.data ?? bySearch[search] ?? [];
    return new Response(
      JSON.stringify({
        success: true,
        data,
        meta: {
          timestamp: "2026-08-17T13:50:31.446Z",
          requestId: `request-${search}`,
          pagination: { page: 1, limit: 10, total: data.length, hasMore: false },
        },
      }),
      { status: 200 },
    );
  };
}

describe("discovery aggregation", () => {
  it("loads every judged category from an explicit live registry query", async () => {
    const searches: string[] = [];
    const result = await loadDiscovery(registryFetcher({}, searches));

    expect(searches).toEqual([
      "rebalancing",
      "grid trading",
      "yield optimization",
      "health factor",
    ]);
    expect(result.categories.map((entry) => entry.category.slug)).toEqual([
      "rebalancing",
      "grid-trading",
      "yield-optimisation",
      "health-factor-monitoring",
    ]);
    expect(result.categories.every((entry) => entry.status === "ready")).toBe(true);
    expect(result.categories.every((entry) => entry.agents.length === 1)).toBe(true);
    expect(result.uniqueAgents).toHaveLength(4);
  });

  it("keeps a multi-category identity in both categories but deduplicates inventory", async () => {
    const multi = {
      ...capturedRebalancer.data[0],
      description: "PancakeSwap LP rebalancing and grid trading agent",
    };
    const result = await loadDiscovery(
      registryFetcher({
        rebalancing: { data: [multi] },
        "grid trading": { data: [multi] },
        "yield optimization": { data: [] },
        "health factor": { data: [] },
      }),
    );

    expect(result.categories[0].agents[0].categoryClaims).toHaveLength(2);
    expect(result.categories[1].agents[0].categoryClaims).toHaveLength(2);
    expect(result.uniqueAgents).toHaveLength(1);
  });

  it("preserves empty, rate-limit, and upstream-error states without fallback agents", async () => {
    const result = await loadDiscovery(
      registryFetcher({
        rebalancing: { data: [] },
        "grid trading": { status: 429 },
        "yield optimization": { status: 503 },
        "health factor": { data: [] },
      }),
    );

    expect(result.categories.map(({ status }) => status)).toEqual([
      "empty",
      "rate-limit",
      "error",
      "empty",
    ]);
    expect(result.categories[1].retryAfter).toBe("60");
    expect(result.uniqueAgents).toEqual([]);
  });

  it("filters a registry search hit that does not explicitly claim the category", async () => {
    const unrelated = {
      ...capturedRebalancer.data[0],
      name: "Reader Feng",
      description: "Chinese metaphysics and Yin Yang rebalancing",
    };
    const result = await loadDiscovery(
      registryFetcher({
        rebalancing: { data: [unrelated] },
        "grid trading": { data: [] },
        "yield optimization": { data: [] },
        "health factor": { data: [] },
      }),
    );

    expect(result.categories[0].status).toBe("empty");
    expect(result.categories[0].agents).toEqual([]);
  });
});
