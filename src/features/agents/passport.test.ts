import { describe, expect, it } from "vitest";

import { AgentPassportNotFoundError, loadAgentPassport, REBALANCER_AGENT_ID } from "./passport";
import categoryAgents from "./sources/fixtures/8004scan-category-agents.json";
import rebalancerResponse from "./sources/fixtures/8004scan-rebalancer.json";
import health from "./sources/fixtures/rebalancer-health.json";
import metadata from "./sources/fixtures/rebalancer-metadata.json";
import performance from "./sources/fixtures/rebalancer-performance.json";
import positions from "./sources/fixtures/rebalancer-positions.json";
import status from "./sources/fixtures/rebalancer-status.json";
import strategy from "./sources/fixtures/rebalancer-strategy.json";
import transactions from "./sources/fixtures/rebalancer-transactions.json";
import capturedTestnetAgent from "./sources/fixtures/8004scan-mefai-testnet.json";
import { REFERENCE_SELLER_AGENT_ID, REFERENCE_SELLER_ORIGIN } from "@/features/activation/contracts";
import { createReferenceSellerCard, createReferenceSellerRegistration } from "@/features/reference-seller/a2a";

const serviceResponses: Record<string, unknown> = {
  "/health": health,
  "/metadata": metadata,
  "/status": status,
  "/strategy": strategy,
  "/performance": performance,
  "/positions": positions,
  "/transactions": transactions,
};

function passportFetcher(
  registryRecords: unknown[] = rebalancerResponse.data,
  serviceOverrides: Partial<Record<string, { status: number } | unknown>> = {},
  origins: string[] = [],
  searches: string[] = [],
): typeof fetch {
  return async (input) => {
    const url = new URL(String(input));
    origins.push(url.origin);
    if (url.origin === "https://8004scan.io") {
      searches.push(url.searchParams.get("search") ?? "");
      return new Response(JSON.stringify({
        success: true,
        data: registryRecords,
        meta: {
          timestamp: "2026-08-17T13:50:31.446Z",
          requestId: "passport-request",
          pagination: { page: 1, limit: 10, total: registryRecords.length, hasMore: false },
        },
      }), { status: 200 });
    }
    const response = serviceOverrides[url.pathname] ?? serviceResponses[url.pathname];
    if (response && typeof response === "object" && Object.keys(response).length === 1 && "status" in response && typeof response.status === "number") {
      return new Response("failure", { status: response.status });
    }
    return new Response(JSON.stringify(response), { status: response ? 200 : 404 });
  };
}

describe("agent passport loader", () => {
  it("loads the exact registry identity and qualifies the configured rebalancer as observed", async () => {
    const searches: string[] = [];
    const passport = await loadAgentPassport(REBALANCER_AGENT_ID, passportFetcher(undefined, {}, [], searches));

    expect(passport.identity.agentId).toBe(REBALANCER_AGENT_ID);
    expect(searches).toEqual(["265375"]);
    expect(passport.evidenceState).toBe("observed");
    expect(passport.rebalancingEvidence?.pancakePositionNftId).toBe("7116214");
  });

  it("does not call the rebalancer service for another live identity", async () => {
    const origins: string[] = [];
    const other = categoryAgents[0];
    const passport = await loadAgentPassport(other.agent_id, passportFetcher([other], {}, origins));

    expect(passport.identity.agentId).toBe(other.agent_id);
    expect(passport.evidenceState).toBe("claimed");
    expect(passport.rebalancingEvidence).toBeUndefined();
    expect(origins).toEqual(["https://8004scan.io"]);
  });

  it("queries the BSC network encoded in a testnet agent identifier", async () => {
    let requestedChainId = "";
    const fetcher: typeof fetch = async (input) => {
      const url = new URL(String(input));
      requestedChainId = url.searchParams.get("chainId") ?? "";
      return new Response(JSON.stringify({
        success: true,
        data: [capturedTestnetAgent],
        meta: {
          timestamp: "2026-08-17T00:00:00Z",
          requestId: "testnet-passport",
          pagination: { page: 1, limit: 10, total: 1, hasMore: false },
        },
      }), { status: 200 });
    };

    const result = await loadAgentPassport(capturedTestnetAgent.agent_id, fetcher);

    expect(requestedChainId).toBe("97");
    expect(result.identity.agentId).toBe(capturedTestnetAgent.agent_id);
  });

  it("reconciles the Castyard seller passport with its bound live service documents", async () => {
    const sellerRecord = {
      ...capturedTestnetAgent,
      agent_id: REFERENCE_SELLER_AGENT_ID,
      token_id: "1830",
      owner_address: "0x74258A428e94294F14a8c8308CE21259223A0187",
      name: "Castyard Reference Seller",
      description: "A standards-based ERC-8004 seller for four read-only BSC DeFi analysis skills.",
      x402_supported: true,
    };
    const requests: string[] = [];
    const fetcher: typeof fetch = async (input) => {
      const url = new URL(String(input));
      requests.push(url.pathname);
      if (url.origin === "https://8004scan.io") {
        return new Response(JSON.stringify({
          success: true,
          data: [sellerRecord],
          meta: { timestamp: "2026-08-24T00:00:00Z", requestId: "seller-passport", pagination: { page: 1, limit: 10, total: 1, hasMore: false } },
        }), { status: 200 });
      }
      const document = url.pathname.includes("agent-registration")
        ? createReferenceSellerRegistration(REFERENCE_SELLER_ORIGIN, REFERENCE_SELLER_AGENT_ID)
        : createReferenceSellerCard(REFERENCE_SELLER_ORIGIN, REFERENCE_SELLER_AGENT_ID);
      return new Response(JSON.stringify(document), { status: 200 });
    };

    const result = await loadAgentPassport(REFERENCE_SELLER_AGENT_ID, fetcher);

    expect(requests).toEqual([
      "/api/v1/public/agents",
      "/.well-known/agent-card.json",
      "/.well-known/agent-registration.json",
    ]);
    expect(result.identity.x402Supported).toBe(false);
    expect(result.activationRails).toEqual(["erc8183"]);
    expect(result.categoryClaims).toHaveLength(4);
  });

  it("retains partial evidence when one operator panel fails", async () => {
    const passport = await loadAgentPassport(
      REBALANCER_AGENT_ID,
      passportFetcher(rebalancerResponse.data, { "/performance": { status: 503 } }),
    );

    expect(passport.evidenceState).toBe("observed");
    expect(passport.rebalancingEvidence?.partialFailures).toContain("/performance returned HTTP 503");
  });

  it("does not promote a rebalancer with a mismatched service wallet", async () => {
    const passport = await loadAgentPassport(
      REBALANCER_AGENT_ID,
      passportFetcher(rebalancerResponse.data, {
        "/metadata": { ...metadata, wallet: "0x0000000000000000000000000000000000000001" },
      }),
    );

    expect(passport.evidenceState).toBe("claimed");
    expect(passport.qualificationProblems).toContain("Service wallet does not match ERC-8004 owner");
  });

  it("rejects a search response that does not contain the requested identity", async () => {
    await expect(
      loadAgentPassport(REBALANCER_AGENT_ID, passportFetcher([categoryAgents[0]])),
    ).rejects.toBeInstanceOf(AgentPassportNotFoundError);
  });
});
