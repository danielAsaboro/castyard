type UpstreamStateKind = "empty" | "error" | "rate-limit" | "stale" | "partial";

const COPY: Record<UpstreamStateKind, { title: string; body: string }> = {
  empty: { title: "No matching live records", body: "The source returned no agents that meet this category's explicit claim rules." },
  error: { title: "Live source unavailable", body: "Castyard could not verify the source right now. No fallback agents have been substituted." },
  "rate-limit": { title: "Source limit reached", body: "The public registry has asked Castyard to pause before requesting more data." },
  stale: { title: "Showing stale evidence", body: "The last observation remains visible, but it is no longer labelled current." },
  partial: { title: "Some evidence is unavailable", body: "Available panels remain visible and the affected source is marked explicitly." },
};

export function UpstreamState({ kind, retryAfter }: { kind: UpstreamStateKind; retryAfter?: string }) {
  const copy = COPY[kind];
  return (
    <section className="upstream-state" role="status">
      <h2>{copy.title}</h2>
      <p>{copy.body}</p>
      {retryAfter ? <p>Try again in {retryAfter} seconds.</p> : null}
    </section>
  );
}
