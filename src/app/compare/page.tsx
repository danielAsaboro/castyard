import type { Metadata } from "next";

import { buildComparison } from "@/features/agents/compare";
import { CompareTable } from "@/features/agents/compare-table";
import type { AgentPassport } from "@/features/agents/domain";
import { loadDiscovery } from "@/features/agents/discovery";
import { loadAgentPassport } from "@/features/agents/passport";

export const metadata: Metadata = { title: "Compare agent evidence" };
export const revalidate = 30;

function requestedIds(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return [...new Set(Array.isArray(value) ? value : [value])].slice(0, 3);
}

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ id?: string | string[] }> }) {
  const [{ id }, discovery] = await Promise.all([searchParams, loadDiscovery()]);
  const available = new Map(discovery.uniqueAgents.map((agent) => [agent.identity.agentId, agent]));
  const requested = requestedIds(id).filter((agentId) => available.has(agentId));
  const selectedIds = requested.length ? requested : [...available.keys()].slice(0, 3);
  const passports = await Promise.all(selectedIds.map(async (agentId): Promise<AgentPassport> => {
    try {
      return await loadAgentPassport(agentId);
    } catch {
      return available.get(agentId)!;
    }
  }));
  const comparison = buildComparison(passports);

  return (
    <section className="container route-page">
      <p className="eyebrow">Field-by-field, source-by-source</p>
      <h1 className="section-title">Compare evidence, not hype.</h1>
      <p className="lede">No winner, composite rating, or inferred safety score. Missing observations stay missing.</p>
      <form className="compare-picker paper-panel" action="/compare">
        <fieldset>
          <legend>Choose up to three current agents</legend>
          {discovery.uniqueAgents.map((agent) => (
            <label key={agent.identity.agentId}>
              <input type="checkbox" name="id" value={agent.identity.agentId} defaultChecked={selectedIds.includes(agent.identity.agentId)} />
              <span>{agent.identity.name}</span>
            </label>
          ))}
        </fieldset>
        <button className="button-primary" type="submit">Build comparison</button>
      </form>
      {comparison.agents.length ? <CompareTable comparison={comparison} /> : (
        <div className="upstream-state"><h2>No comparable records</h2><p>The live discovery source returned no qualifying agents.</p></div>
      )}
    </section>
  );
}
