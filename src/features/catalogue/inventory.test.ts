import { describe, expect, it } from "vitest";

import rebalancer from "@/features/agents/sources/fixtures/8004scan-rebalancer.json";
import categoryAgents from "@/features/agents/sources/fixtures/8004scan-category-agents.json";
import { loadMarketplaceInventory } from "./inventory";
import capturedTestnetAgent from "@/features/agents/sources/fixtures/8004scan-mefai-testnet.json";
import { REFERENCE_SELLER_AGENT_ID } from "@/features/activation/contracts";

const records: Record<string, unknown[]> = {
  rebalancing: rebalancer.data,
  "grid trading": [categoryAgents[0]],
  "yield optimization": [categoryAgents[1]],
  "yield optimisation": [categoryAgents[1]],
  "health factor": [categoryAgents[2]],
};

const referenceSeller = {
  ...capturedTestnetAgent,
  agent_id: REFERENCE_SELLER_AGENT_ID,
  token_id: "1830",
  owner_address: "0x74258A428e94294F14a8c8308CE21259223A0187",
  name: "Castyard Reference Seller",
  description: "A standards-based ERC-8004 seller for four read-only BSC DeFi analysis skills.",
};

const referenceSellerCard = {
  name: "Castyard Reference Seller",
  supportedInterfaces: [{ url: "https://castyard-agents.asaborodaniel.chatgpt.site/api/reference-seller/a2a", protocolBinding: "JSONRPC", protocolVersion: "1.0" }],
  skills: ["rebalancing", "grid-trading", "yield-optimisation", "health-factor-monitoring"].map((id) => ({ id, name: id })),
  metadata: { erc8004AgentId: REFERENCE_SELLER_AGENT_ID, executionProtocol: "ERC-8183", chainId: 97 },
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
    let cardRequests = 0;
    const fetcher: typeof fetch = async (input) => {
      const url = new URL(String(input));
      if (url.origin === "https://castyard-agents.asaborodaniel.chatgpt.site") {
        cardRequests += 1;
        return new Response(JSON.stringify(referenceSellerCard), { status: 200 });
      }
      const chainId = url.searchParams.get("chainId") ?? "";
      const search = url.searchParams.get("search") ?? "";
      requests.push(`${chainId}:${search}`);
      if (chainId === "97" && search === "1830") return response([referenceSeller]);
      return response(chainId === "56" ? records[search] ?? [] : []);
    };

    const result = await loadMarketplaceInventory(fetcher);

    expect(requests).toHaveLength(11);
    expect(cardRequests).toBe(1);
    expect(result.agents).toHaveLength(5);
    expect(result.complete).toBe(true);
    expect(result.agents.every((agent) => agent.categoryClaims.length > 0)).toBe(true);
    const seller = result.agents.find(({ identity }) => identity.agentId === REFERENCE_SELLER_AGENT_ID);
    expect(seller?.categoryClaims).toHaveLength(4);
    expect(seller?.activationRails).toEqual(["erc8183"]);
  });

  it("retains successful records and reports an incomplete refresh", async () => {
    const fetcher: typeof fetch = async (input) => {
      const url = new URL(String(input));
      if (url.origin === "https://castyard-agents.asaborodaniel.chatgpt.site") {
        return new Response(JSON.stringify(referenceSellerCard), { status: 200 });
      }
      if (url.searchParams.get("chainId") === "97" && url.searchParams.get("search") === "grid trading") {
        return new Response("unavailable", { status: 503 });
      }
      if (url.searchParams.get("chainId") === "97" && url.searchParams.get("search") === "1830") {
        return response([referenceSeller]);
      }
      return response(url.searchParams.get("chainId") === "56" ? records[url.searchParams.get("search") ?? ""] ?? [] : []);
    };

    const result = await loadMarketplaceInventory(fetcher);

    expect(result.agents).toHaveLength(5);
    expect(result.complete).toBe(false);
    expect(result.coverage.some((entry) => entry.status === "partial")).toBe(true);
  });
});
