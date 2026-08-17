import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { UpstreamState } from "@/components/upstream-state";
import { AgentCard } from "@/features/agents/agent-card";
import { AGENT_CATEGORIES } from "@/features/agents/domain";
import { loadDiscovery } from "@/features/agents/discovery";

export const revalidate = 60;

export function generateStaticParams() {
  return AGENT_CATEGORIES.map(({ slug }) => ({ category: slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ category: string }> }): Promise<Metadata> {
  const { category } = await params;
  const definition = AGENT_CATEGORIES.find((item) => item.slug === category);
  return definition ? { title: definition.label, description: definition.description } : {};
}

export default async function CategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  const definition = AGENT_CATEGORIES.find((item) => item.slug === category);
  if (!definition) notFound();
  const discovery = await loadDiscovery();
  const result = discovery.categories.find((entry) => entry.category.slug === category);
  if (!result) notFound();

  return (
    <section className="container route-page">
      <p className="eyebrow">Judged agent category</p>
      <h1 className="section-title">{definition.label}</h1>
      <p className="lede">{definition.description}</p>
      <div className="category-requirements paper-panel">
        <h2>Evidence required before activation</h2>
        <ol>{definition.evidenceChecklist.map((item) => <li key={item}>{item}</li>)}</ol>
      </div>
      {result.status === "ready" ? (
        <div className="agent-inventory">{result.agents.map((agent) => <AgentCard agent={agent} key={agent.identity.agentId} />)}</div>
      ) : (
        <UpstreamState kind={result.status === "rate-limit" ? "rate-limit" : result.status} retryAfter={result.retryAfter} />
      )}
    </section>
  );
}
