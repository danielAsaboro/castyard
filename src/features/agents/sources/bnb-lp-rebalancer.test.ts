import { describe, expect, it } from "vitest";

import type { AgentIdentity } from "../domain";
import { fetchBnbLpRebalancerEvidence } from "./bnb-lp-rebalancer";
import health from "./fixtures/rebalancer-health.json";
import metadata from "./fixtures/rebalancer-metadata.json";
import performance from "./fixtures/rebalancer-performance.json";
import positions from "./fixtures/rebalancer-positions.json";
import status from "./fixtures/rebalancer-status.json";
import strategy from "./fixtures/rebalancer-strategy.json";
import transactions from "./fixtures/rebalancer-transactions.json";

const responses: Record<string, unknown> = {
  "/health": health,
  "/metadata": metadata,
  "/status": status,
  "/strategy": strategy,
  "/performance": performance,
  "/positions": positions,
  "/transactions": transactions,
};

const identity: AgentIdentity = {
  agentId: "56:0x8004a169fb4a3325136eb29fa0ceb6d2e539a432:265375",
  erc8004AgentTokenId: "265375",
  chainId: 56,
  registryAddress: "0x8004a169fb4a3325136eb29fa0ceb6d2e539a432",
  ownerAddress: "0x20f1ca5d1e5a3ee94c29dbf95e6bf6cea6a8d64b",
  name: "BNB LP Range Rebalancer",
  description: "PancakeSwap V3 LP range rebalancer",
  supportedProtocols: ["A2A"],
  x402Supported: true,
  source: {
    sourceName: "8004scan",
    sourceUrl: "https://8004scan.io/agents/bsc/265375",
    observedAt: "2026-08-17T13:26:09Z",
  },
};

function sourceFetcher(
  overrides: Partial<Record<string, unknown | { status: number }>> = {},
  requests: { method: string; path: string }[] = [],
): typeof fetch {
  return async (input, init) => {
    const url = new URL(String(input));
    requests.push({ method: init?.method ?? "GET", path: url.pathname });
    const response = overrides[url.pathname] ?? responses[url.pathname];
    if (
      response &&
      typeof response === "object" &&
      Object.keys(response).length === 1 &&
      "status" in response &&
      typeof response.status === "number"
    ) {
      return new Response("upstream failure", { status: response.status as number });
    }
    return new Response(JSON.stringify(response), { status: response ? 200 : 404 });
  };
}

describe("BNB LP Range Rebalancer source", () => {
  it("fetches only the seven allowlisted read endpoints", async () => {
    const requests: { method: string; path: string }[] = [];
    await fetchBnbLpRebalancerEvidence(identity, sourceFetcher({}, requests));

    expect(requests.every((request) => request.method === "GET")).toBe(true);
    expect(requests.map((request) => request.path)).toEqual([
      "/health",
      "/metadata",
      "/status",
      "/strategy",
      "/performance",
      "/positions",
      "/transactions",
    ]);
  });

  it("keeps agent identity and position NFT identifiers separate", async () => {
    const evidence = await fetchBnbLpRebalancerEvidence(identity, sourceFetcher());

    expect(evidence.erc8004AgentTokenId).toBe("265375");
    expect(evidence.pancakePositionNftId).toBe("7116214");
    expect(evidence.receipts).toHaveLength(3);
    expect(evidence.pnl?.value).toBeLessThan(0);
    expect(evidence.apr?.windowComplete).toBe(false);
    expect(evidence.rangePercent).toBe(10);
    expect(evidence.triggerPercent).toBe(5);
    expect(evidence.maxSlippagePercent).toBe(1);
    expect(evidence.problems).toEqual([]);
  });

  it("reports a chain mismatch without treating it as observed evidence", async () => {
    const evidence = await fetchBnbLpRebalancerEvidence(
      identity,
      sourceFetcher({ "/health": { ...health, chain_id: 97 } }),
    );

    expect(evidence.problems).toContain("Service reported chain 97 instead of BSC mainnet 56");
  });

  it("reports an owner mismatch", async () => {
    const evidence = await fetchBnbLpRebalancerEvidence(
      identity,
      sourceFetcher({
        "/metadata": { ...metadata, wallet: "0x0000000000000000000000000000000000000001" },
      }),
    );

    expect(evidence.problems).toContain("Service wallet does not match ERC-8004 owner");
  });

  it("retains other evidence when one endpoint fails", async () => {
    const evidence = await fetchBnbLpRebalancerEvidence(
      identity,
      sourceFetcher({ "/performance": { status: 503 } }),
    );

    expect(evidence.partialFailures).toContain("/performance returned HTTP 503");
    expect(evidence.pancakePositionNftId).toBe("7116214");
  });

  it("rejects an invalid receipt without inventing a replacement", async () => {
    const invalidTransactions = {
      ...transactions,
      transactions: [{ ...transactions.transactions[0], txs: ["not-a-hash"] }],
    };
    const evidence = await fetchBnbLpRebalancerEvidence(
      identity,
      sourceFetcher({ "/transactions": invalidTransactions }),
    );

    expect(evidence.receipts).toEqual([]);
    expect(evidence.partialFailures).toContain("Transaction feed contained an invalid BSC hash");
  });
});
