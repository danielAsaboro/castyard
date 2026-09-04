import Link from "next/link";

import { UpstreamState } from "@/components/upstream-state";
import { AgentCard } from "./agent-card";
import type { CategoryDiscovery } from "./discovery";

export function CategoryGrid({ categories, now }: { categories: CategoryDiscovery[]; now?: Date }) {
  return (
    <div className="category-grid">
      {categories.map((entry, index) => (
        <section className="category-card paper-panel" data-testid="category-card" key={entry.category.slug}>
          <div className="category-index">0{index + 1}</div>
          <div className="category-copy">
            <h2>{entry.category.label}</h2>
            <p>{entry.category.description}</p>
            <ul data-testid="decision-checklist">
              {entry.category.evidenceChecklist.map((item) => <li key={item}>{item}</li>)}
            </ul>
            <Link href={`/categories/${entry.category.slug}`} prefetch={false}>View category requirements</Link>
          </div>
          <div className="category-result">
            {entry.status === "ready" && entry.agents[0] ? (
              <AgentCard agent={entry.agents[0]} now={now} />
            ) : (
              <UpstreamState
                kind={entry.status === "ready" ? "empty" : entry.status}
                retryAfter={entry.retryAfter}
              />
            )}
          </div>
        </section>
      ))}
    </div>
  );
}
