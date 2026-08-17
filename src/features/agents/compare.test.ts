import { describe, expect, it } from "vitest";

import type { AgentPassport } from "./domain";
import { buildComparison } from "./compare";

function passport(overrides: Partial<AgentPassport> = {}): AgentPassport {
  return {
    identity: {
      agentId: "56:0x8004a169fb4a3325136eb29fa0ceb6d2e539a432:1",
      erc8004AgentTokenId: "1",
      chainId: 56,
      registryAddress: "0x8004a169fb4a3325136eb29fa0ceb6d2e539a432",
      ownerAddress: "0x20f1ca5d1e5a3ee94c29dbf95e6bf6cea6a8d64b",
      name: "Agent one",
      description: "Published description",
      supportedProtocols: ["A2A"],
      x402Supported: true,
      totalFeedbacks: 0,
      source: { sourceName: "8004scan", sourceUrl: "https://8004scan.io", observedAt: "2026-08-17T12:00:00Z" },
    },
    categoryClaims: [{ category: "rebalancing", matchedPhrase: "rebalancer" }],
    evidenceState: "claimed",
    qualificationProblems: [],
    ...overrides,
  };
}

describe("buildComparison", () => {
  it("compares only named evidence fields and never emits a synthetic score", () => {
    const comparison = buildComparison([passport()]);

    expect(comparison.rows.map((row) => row.key)).toEqual([
      "evidence-state",
      "capability-claims",
      "protocol-markers",
      "x402-marker",
      "registry-feedback",
      "owner-service-match",
      "execution-receipts",
    ]);
    expect(JSON.stringify(comparison).toLowerCase()).not.toContain("overall score");
    expect(JSON.stringify(comparison).toLowerCase()).not.toContain("safety score");
  });

  it("keeps missing observations explicit and below observed evidence", () => {
    const observed = passport({
      evidenceState: "observed",
      observation: {
        source: { sourceName: "operator API", sourceUrl: "https://operator.example", observedAt: "2026-08-17T12:00:00Z" },
        chainId: 56,
        walletAddress: "0x20f1ca5d1e5a3ee94c29dbf95e6bf6cea6a8d64b",
        problems: [],
      },
      rebalancingEvidence: {
        source: { sourceName: "operator API", sourceUrl: "https://operator.example", observedAt: "2026-08-17T12:00:00Z" },
        chainId: 56,
        walletAddress: "0x20f1ca5d1e5a3ee94c29dbf95e6bf6cea6a8d64b",
        problems: [],
        erc8004AgentTokenId: "1",
        receipts: [{ hash: `0x${"a".repeat(64)}`, explorerUrl: `https://bscscan.com/tx/0x${"a".repeat(64)}` }],
        riskControls: [],
        partialFailures: [],
      },
    });
    const claimed = passport({ identity: { ...passport().identity, agentId: "56:registry:2", name: "Agent two" } });
    const comparison = buildComparison([observed, claimed]);
    const receiptRow = comparison.rows.find((row) => row.key === "execution-receipts");

    expect(comparison.agents.map((agent) => agent.evidenceState)).toEqual(["observed", "claimed"]);
    expect(receiptRow?.cells[0]).toMatchObject({ value: "1 linked receipt", evidenceState: "observed" });
    expect(receiptRow?.cells[1]).toMatchObject({ value: "Not observed", evidenceState: "registered" });
  });
});
