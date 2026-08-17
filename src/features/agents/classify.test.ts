import { describe, expect, it } from "vitest";

import type { AgentIdentity } from "./domain";
import { classifyCategoryClaims } from "./classify";

function identity(name: string, description: string): AgentIdentity {
  return {
    agentId: "56:0x8004a169fb4a3325136eb29fa0ceb6d2e539a432:1",
    erc8004AgentTokenId: "1",
    chainId: 56,
    registryAddress: "0x8004a169fb4a3325136eb29fa0ceb6d2e539a432",
    ownerAddress: "0x20f1ca5d1e5a3ee94c29dbf95e6bf6cea6a8d64b",
    name,
    description,
    supportedProtocols: [],
    x402Supported: false,
    source: {
      sourceName: "8004scan",
      sourceUrl: "https://8004scan.io/agents/bsc/1",
      observedAt: "2026-08-17T13:00:00Z",
    },
  };
}

describe("category claim classifier", () => {
  it.each([
    ["Rebalance desk", "PancakeSwap LP range rebalancer", "rebalancing", "range rebalancer"],
    ["Grid desk", "Runs bounded GRID TRADING for a DeFi pair", "grid-trading", "grid trading"],
    ["Yield desk", "BSC risk-adjusted yield optimiser", "yield-optimisation", "risk-adjusted yield"],
    ["Rescue desk", "Venus lending rescue with a health factor trigger", "health-factor-monitoring", "health factor"],
  ])("classifies %s from an explicit phrase", (name, description, category, matchedPhrase) => {
    expect(classifyCategoryClaims(identity(name, description))).toContainEqual({
      category,
      matchedPhrase,
    });
  });

  it("preserves separate reasons for a multi-category agent", () => {
    const claims = classifyCategoryClaims(
      identity("DeFi operator", "PancakeSwap LP rebalancing plus bounded grid trading"),
    );

    expect(claims).toEqual([
      { category: "rebalancing", matchedPhrase: "rebalancing" },
      { category: "grid-trading", matchedPhrase: "grid trading" },
    ]);
  });

  it.each([
    ["Balance reader", "Reads an account balance"],
    ["Reader Feng", "Chinese metaphysics and Yin Yang rebalancing"],
    ["Grid layout", "Creates a visual grid for a website"],
  ])("rejects unrelated wording for %s", (name, description) => {
    expect(classifyCategoryClaims(identity(name, description))).toEqual([]);
  });
});
