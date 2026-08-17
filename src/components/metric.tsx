import type { EvidenceValue } from "@/features/agents/domain";
import { formatEvidenceValue, type EvidenceFormatOptions } from "@/features/agents/format";

interface MetricProps extends EvidenceFormatOptions {
  label: string;
  evidence?: EvidenceValue<number>;
}

export function Metric({ label, evidence, style }: MetricProps) {
  return (
    <div className="metric">
      <div className="metric-label">{label}</div>
      <div className="metric-value">{formatEvidenceValue(evidence, { style })}</div>
      {evidence?.definition ? <p className="metric-definition">{evidence.definition}</p> : null}
    </div>
  );
}
