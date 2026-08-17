import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AGENT_CATEGORIES, type AgentSummary } from "./domain";
import type { CategoryDiscovery } from "./discovery";
import { CategoryGrid } from "./category-grid";

function summary(index: number): AgentSummary {
  const category = AGENT_CATEGORIES[index];
  return {
    identity: {
      agentId: `56:0x8004a169fb4a3325136eb29fa0ceb6d2e539a432:${index + 1}`,
      erc8004AgentTokenId: String(index + 1),
      chainId: 56,
      registryAddress: "0x8004a169fb4a3325136eb29fa0ceb6d2e539a432",
      ownerAddress: "0x20f1ca5d1e5a3ee94c29dbf95e6bf6cea6a8d64b",
      name: `${category.label} agent`,
      description: `A live registry record claiming ${category.label}.`,
      supportedProtocols: ["A2A"],
      x402Supported: index === 0,
      source: {
        sourceName: "8004scan",
        sourceUrl: `https://8004scan.io/agents/bsc/${index + 1}`,
        observedAt: "2026-08-17T13:50:00Z",
      },
    },
    categoryClaims: [{ category: category.slug, matchedPhrase: category.label.toLowerCase() }],
    evidenceState: "claimed",
    qualificationProblems: [],
  };
}

describe("category grid", () => {
  it("renders equal evidence anatomy for every judged category", () => {
    const categories: CategoryDiscovery[] = AGENT_CATEGORIES.map((category, index) => ({
      category,
      agents: [summary(index)],
      status: "ready",
      source: summary(index).identity.source,
    }));

    render(<CategoryGrid categories={categories} now={new Date("2026-08-17T13:51:00Z")} />);

    const cards = screen.getAllByTestId("category-card");
    expect(cards).toHaveLength(4);
    for (const [index, card] of cards.entries()) {
      expect(within(card).getByRole("heading", { name: AGENT_CATEGORIES[index].label })).toBeInTheDocument();
      expect(within(card).getByTestId("decision-checklist")).toBeInTheDocument();
      expect(within(card).getByText("Claimed capability")).toBeInTheDocument();
      expect(within(card).getByText(/8004scan/i)).toBeInTheDocument();
      expect(within(card).getByRole("link", { name: /inspect passport/i })).toBeInTheDocument();
    }
  });

  it("uses the same recoverable empty-state region for every category", () => {
    const categories: CategoryDiscovery[] = AGENT_CATEGORIES.map((category) => ({
      category,
      agents: [],
      status: "empty",
    }));

    render(<CategoryGrid categories={categories} />);

    expect(screen.getAllByRole("status")).toHaveLength(4);
    expect(screen.getAllByText("No matching live records")).toHaveLength(4);
  });
});
