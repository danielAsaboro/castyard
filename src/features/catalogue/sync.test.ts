import { describe, expect, it } from "vitest";

import mainnetResponse from "@/features/agents/sources/fixtures/8004scan-rebalancer.json";
import testnetAgent from "@/features/agents/sources/fixtures/8004scan-mefai-testnet.json";
import { fetchCompleteBscCatalogue } from "./sync";

function page(data: unknown[], pageNumber: number, hasMore: boolean): Response {
  return new Response(JSON.stringify({
    success: true,
    data,
    meta: {
      timestamp: "2026-08-17T00:00:00Z",
      requestId: `page-${pageNumber}`,
      pagination: { page: pageNumber, limit: 50, total: hasMore ? data.length + 1 : data.length, hasMore },
    },
  }), { status: 200 });
}

describe("complete BSC catalogue synchronization", () => {
  it("walks every reported page and deduplicates canonical identities", async () => {
    const requests: string[] = [];
    const fetcher: typeof fetch = async (input) => {
      const url = new URL(String(input));
      requests.push(`${url.searchParams.get("chainId")}:${url.searchParams.get("page")}`);
      const pageNumber = Number(url.searchParams.get("page"));
      return pageNumber === 1
        ? page(mainnetResponse.data, 1, true)
        : page(mainnetResponse.data, 2, false);
    };

    const result = await fetchCompleteBscCatalogue({ chainIds: [56], fetcher });

    expect(requests).toEqual(["56:1", "56:2"]);
    expect(result.agents).toHaveLength(1);
    expect(result.coverage).toEqual([{ chainId: 56, status: "complete", pagesFetched: 2, reportedTotal: 2 }]);
    expect(result.complete).toBe(true);
  });

  it("keeps successful networks while marking a failed network partial", async () => {
    const fetcher: typeof fetch = async (input) => {
      const url = new URL(String(input));
      const chainId = Number(url.searchParams.get("chainId"));
      if (chainId === 56) return page(mainnetResponse.data, 1, false);
      return new Response("unavailable", { status: 503 });
    };

    const result = await fetchCompleteBscCatalogue({ chainIds: [56, 97], fetcher });

    expect(result.agents.map(({ chainId }) => chainId)).toEqual([56]);
    expect(result.coverage).toEqual([
      { chainId: 56, status: "complete", pagesFetched: 1, reportedTotal: 1 },
      { chainId: 97, status: "partial", pagesFetched: 0, reportedTotal: 0, errorKind: "http" },
    ]);
    expect(result.complete).toBe(false);
  });

  it("combines current mainnet and testnet registrations", async () => {
    const fetcher: typeof fetch = async (input) => {
      const chainId = Number(new URL(String(input)).searchParams.get("chainId"));
      return page(chainId === 56 ? mainnetResponse.data : [testnetAgent], 1, false);
    };

    const result = await fetchCompleteBscCatalogue({ chainIds: [56, 97], fetcher });

    expect(result.agents.map(({ agentId }) => agentId)).toEqual([
      mainnetResponse.data[0].agent_id,
      testnetAgent.agent_id,
    ]);
    expect(result.complete).toBe(true);
  });
});
