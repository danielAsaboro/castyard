import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { SkillResult } from "./skills/execute";
import { ReferenceSkillEvidenceGrid } from "./public-evidence";

const skills = ["rebalancing", "grid-trading", "yield-optimisation", "health-factor-monitoring"];
const results: SkillResult[] = skills.map((skill, index) => ({
  skill,
  chainId: 97,
  blockNumber: String(129_118_044 + index),
  observedAt: "2026-09-04T19:20:29.000Z",
  sources: [{
    protocol: index < 2 ? "PancakeSwap V3" : "Venus",
    chainId: 97,
    contract: `0x${String(index + 1).repeat(40)}`,
    blockNumber: String(129_118_044 + index),
    calls: ["eth_call"],
  }],
  assumptions: ["Read-only evidence."],
  data: { status: "observed" },
}));

describe("public reference-seller evidence", () => {
  it("renders equal-depth live provenance for all four required skills", () => {
    render(<ReferenceSkillEvidenceGrid results={results} />);

    expect(screen.getAllByText("Live BSC testnet read")).toHaveLength(4);
    expect(screen.getByRole("heading", { name: "Rebalancing" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Grid trading" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Yield optimisation" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Health-factor monitoring" })).toBeInTheDocument();
    expect(screen.getAllByText(/12911804/)).toHaveLength(4);
  });
});
