import { describe, expect, it } from "vitest";

import type { AgentIdentity, AgentObservation } from "./domain";
import { qualifyAgent } from "./qualify";

const source = {
  sourceName: "live source",
  sourceUrl: "https://example.com/evidence",
  observedAt: "2026-08-17T13:00:00Z",
};

function identity(description: string): AgentIdentity {
  return {
    agentId: "56:0x8004a169fb4a3325136eb29fa0ceb6d2e539a432:265375",
    erc8004AgentTokenId: "265375",
    chainId: 56,
    registryAddress: "0x8004a169fb4a3325136eb29fa0ceb6d2e539a432",
    ownerAddress: "0x20f1ca5d1e5a3ee94c29dbf95e6bf6cea6a8d64b",
    name: "BNB operator",
    description,
    supportedProtocols: ["A2A"],
    x402Supported: true,
    source,
  };
}

function observation(overrides: Partial<AgentObservation> = {}): AgentObservation {
  return {
    source,
    chainId: 56,
    walletAddress: "0x20f1cA5d1e5A3Ee94C29DbF95e6BF6ceA6a8d64b",
    problems: [],
    ...overrides,
  };
}

describe("agent qualification", () => {
  it("keeps an unclassified registry record at registered", () => {
    expect(qualifyAgent(identity("General BSC assistant")).evidenceState).toBe("registered");
  });

  it("labels an explicit capability without observations as claimed", () => {
    expect(
      qualifyAgent(identity("PancakeSwap LP range rebalancer")).evidenceState,
    ).toBe("claimed");
  });

  it("advances a claimed agent with matching live evidence to observed", () => {
    const result = qualifyAgent(identity("PancakeSwap LP range rebalancer"), observation());

    expect(result.evidenceState).toBe("observed");
    expect(result.qualificationProblems).toEqual([]);
  });

  it("does not observe an agent when the service wallet differs from the owner", () => {
    const result = qualifyAgent(
      identity("PancakeSwap LP range rebalancer"),
      observation({ walletAddress: "0x0000000000000000000000000000000000000001" }),
    );

    expect(result.evidenceState).toBe("claimed");
    expect(result.qualificationProblems).toContain("Service wallet does not match ERC-8004 owner");
  });

  it("retains upstream qualification problems without promoting the agent", () => {
    const result = qualifyAgent(
      identity("PancakeSwap LP range rebalancer"),
      observation({ problems: ["Service reported the wrong chain"] }),
    );

    expect(result.evidenceState).toBe("claimed");
    expect(result.qualificationProblems).toEqual(["Service reported the wrong chain"]);
  });
});
