import type { AgentPassport, EvidenceState } from "./domain";

const EVIDENCE_RANK: Record<EvidenceState, number> = {
  registered: 0,
  claimed: 1,
  observed: 2,
};

export interface ComparisonCell {
  value: string;
  evidenceState: EvidenceState;
}

export interface ComparisonRow {
  key: string;
  label: string;
  definition: string;
  cells: ComparisonCell[];
}

export interface Comparison {
  agents: AgentPassport[];
  rows: ComparisonRow[];
}

export function buildComparison(input: AgentPassport[]): Comparison {
  const agents = [...input].sort((a, b) => EVIDENCE_RANK[b.evidenceState] - EVIDENCE_RANK[a.evidenceState]);
  const row = (
    key: string,
    label: string,
    definition: string,
    cell: (agent: AgentPassport) => ComparisonCell,
  ): ComparisonRow => ({ key, label, definition, cells: agents.map(cell) });

  return {
    agents,
    rows: [
      row("evidence-state", "Evidence state", "Highest evidence tier currently supported by linked sources.", (agent) => ({ value: agent.evidenceState, evidenceState: agent.evidenceState })),
      row("capability-claims", "Capability claims", "Categories matched from the agent's published name and description.", (agent) => ({ value: agent.categoryClaims.map((claim) => claim.category).join(", ") || "None published", evidenceState: agent.categoryClaims.length ? "claimed" : "registered" })),
      row("protocol-markers", "Protocol markers", "Protocols published in the ERC-8004 registry record; markers are not proof of execution.", (agent) => ({ value: agent.identity.supportedProtocols.join(", ") || "None published", evidenceState: "registered" })),
      row("x402-marker", "x402 marker", "Whether the registry record publishes x402 support; no payment is attempted here.", (agent) => ({ value: agent.identity.x402Supported ? "Published" : "Not published", evidenceState: "registered" })),
      row("registry-feedback", "Registry feedback", "Feedback count reported by 8004scan without converting it into a quality score.", (agent) => ({ value: `${agent.identity.totalFeedbacks ?? 0} feedback`, evidenceState: "registered" })),
      row("owner-service-match", "Owner ↔ service", "Whether a live service wallet was observed and matched to the registry owner.", (agent) => ({ value: agent.observation?.walletAddress && agent.observation.problems.length === 0 ? "Observed match" : "Not observed", evidenceState: agent.observation?.walletAddress && agent.observation.problems.length === 0 ? "observed" : "registered" })),
      row("execution-receipts", "Execution receipts", "Valid BscScan transaction hashes linked by a live operator source.", (agent) => {
        const count = agent.rebalancingEvidence?.receipts.length ?? 0;
        return { value: count ? `${count} linked receipt${count === 1 ? "" : "s"}` : "Not observed", evidenceState: count ? "observed" : "registered" };
      }),
    ],
  };
}
