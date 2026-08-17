import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { Comparison } from "./compare";
import { CompareTable } from "./compare-table";

describe("CompareTable", () => {
  it("renders source-scoped evidence without rankings", () => {
    const comparison: Comparison = {
      agents: [{
        identity: {
          agentId: "56:registry:1", erc8004AgentTokenId: "1", chainId: 56,
          registryAddress: "0x8004a169fb4a3325136eb29fa0ceb6d2e539a432",
          ownerAddress: "0x20f1ca5d1e5a3ee94c29dbf95e6bf6cea6a8d64b",
          name: "Agent one", description: "", supportedProtocols: [], x402Supported: false,
          source: { sourceName: "8004scan", sourceUrl: "https://8004scan.io", observedAt: "2026-08-17T12:00:00Z" },
        },
        categoryClaims: [], evidenceState: "registered", qualificationProblems: [],
      }],
      rows: [{ key: "execution-receipts", label: "Execution receipts", definition: "Valid BscScan transaction hashes.", cells: [{ value: "Not observed", evidenceState: "registered" }] }],
    };

    render(<CompareTable comparison={comparison} />);

    expect(screen.getByRole("table", { name: /agent evidence comparison/i })).toBeInTheDocument();
    expect(screen.getByText("Not observed")).toBeInTheDocument();
    expect(screen.queryByText(/winner|rank|overall score/i)).not.toBeInTheDocument();
  });
});
