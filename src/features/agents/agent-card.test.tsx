import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { AgentSummary } from "./domain";
import { AgentCard } from "./agent-card";

describe("AgentCard", () => {
  it("links composite agent IDs without double-encoding route separators", () => {
    const agentId = "56:0x8004a169fb4a3325136eb29fa0ceb6d2e539a432:265375";
    const agent: AgentSummary = {
      identity: {
        agentId,
        erc8004AgentTokenId: "265375",
        chainId: 56,
        isTestnet: false,
        registryAddress: "0x8004a169fb4a3325136eb29fa0ceb6d2e539a432",
        ownerAddress: "0x20f1ca5d1e5a3ee94c29dbf95e6bf6cea6a8d64b",
        name: "BNB LP Range Rebalancer",
        description: "Rebalances a PancakeSwap V3 position.",
        supportedProtocols: ["A2A"],
        x402Supported: true,
        source: { sourceName: "8004scan", sourceUrl: "https://8004scan.io", observedAt: "2026-08-17T12:00:00Z" },
      },
      categoryClaims: [{ category: "rebalancing", matchedPhrase: "rebalancer" }],
      evidenceState: "claimed",
      activationRails: ["erc8183"],
      qualificationProblems: [],
    };

    render(<AgentCard agent={agent} now={new Date("2026-08-17T12:01:00Z")} />);

    expect(screen.getByRole("link", { name: /inspect passport/i })).toHaveAttribute("href", `/agents/${agentId}`);
    expect(screen.getByText("BSC mainnet")).toBeInTheDocument();
    expect(screen.getByText("ERC-8183 verified")).toBeInTheDocument();
  });
});
