import type { EvidenceState } from "@/features/agents/domain";

const LABELS: Record<EvidenceState, string> = {
  registered: "Registered identity",
  claimed: "Claimed capability",
  observed: "Live observation",
};

export function EvidenceBadge({ state }: { state: EvidenceState }) {
  return <span className={`evidence-badge evidence-${state}`}>{LABELS[state]}</span>;
}
