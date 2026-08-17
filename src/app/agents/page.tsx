import type { Metadata } from "next";

import { AgentCard } from "@/features/agents/agent-card";
import { loadDiscovery } from "@/features/agents/discovery";

export const metadata: Metadata = { title: "Discover live BSC agents" };
export const revalidate = 60;

export default async function AgentsPage({ searchParams }: { searchParams: Promise<{ q?: string; category?: string }> }) {
  const [{ q = "", category = "" }, discovery] = await Promise.all([searchParams, loadDiscovery()]);
  const normalizedQuery = q.trim().toLocaleLowerCase("en-US");
  const agents = discovery.uniqueAgents.filter((agent) => {
    const matchesQuery = !normalizedQuery || `${agent.identity.name} ${agent.identity.description}`.toLocaleLowerCase("en-US").includes(normalizedQuery);
    const matchesCategory = !category || agent.categoryClaims.some((claim) => claim.category === category);
    return matchesQuery && matchesCategory;
  });

  return (
    <section className="container route-page">
      <p className="eyebrow">Live registry inventory</p>
      <h1 className="section-title">Discover BSC agents.</h1>
      <p className="lede">Only current 8004scan records that pass explicit capability-claim rules appear here.</p>
      <form className="discovery-form" action="/agents">
        <label>Search current results<input name="q" defaultValue={q} placeholder="Agent name or published description" /></label>
        <label>Category<select name="category" defaultValue={category}>
          <option value="">All judged categories</option>
          {discovery.categories.map(({ category: item }) => <option value={item.slug} key={item.slug}>{item.label}</option>)}
        </select></label>
        <button className="button-primary" type="submit">Filter</button>
      </form>
      <p className="result-count">{agents.length} current result{agents.length === 1 ? "" : "s"}</p>
      <div className="agent-inventory">
        {agents.map((agent) => <AgentCard agent={agent} key={agent.identity.agentId} />)}
      </div>
    </section>
  );
}
