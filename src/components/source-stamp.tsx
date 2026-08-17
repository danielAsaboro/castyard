import type { SourceStamp as SourceStampValue } from "@/features/agents/domain";
import { formatTimestamp, getFreshness } from "@/features/agents/format";

interface SourceStampProps {
  source: SourceStampValue;
  now?: Date;
  revalidationSeconds?: number;
}

export function SourceStamp({ source, now = new Date(), revalidationSeconds = 60 }: SourceStampProps) {
  const freshness = getFreshness(source, now, revalidationSeconds);
  return (
    <div className="source-stamp">
      <span className={freshness === "stale" ? "source-stale" : undefined}>{freshness}</span>
      <span>{formatTimestamp(source.observedAt)}</span>
      <a href={source.sourceUrl} target="_blank" rel="noopener noreferrer">
        {source.sourceName}
      </a>
    </div>
  );
}
