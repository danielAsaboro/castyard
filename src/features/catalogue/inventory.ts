import type { AgentSummary } from "@/features/agents/domain";
import { qualifyAgent } from "@/features/agents/qualify";
import { fetchCompleteBscCatalogue, type NetworkCoverage } from "./sync";

const MARKETPLACE_SEARCHES = [
  "rebalancing",
  "grid trading",
  "yield optimization",
  "yield optimisation",
  "health factor",
] as const;

export interface MarketplaceInventory {
  agents: AgentSummary[];
  coverage: NetworkCoverage[];
  complete: boolean;
}

export async function loadMarketplaceInventory(fetcher: typeof fetch = fetch): Promise<MarketplaceInventory> {
  const agents = new Map<string, AgentSummary>();
  const coverage: NetworkCoverage[] = [];
  let complete = true;

  for (const search of MARKETPLACE_SEARCHES) {
    const result = await fetchCompleteBscCatalogue({ chainIds: [56, 97], search, fetcher });
    coverage.push(...result.coverage);
    complete = complete && result.complete;
    for (const identity of result.agents) {
      const qualified = qualifyAgent(identity);
      if (qualified.categoryClaims.length > 0) agents.set(identity.agentId, qualified);
    }
  }

  return { agents: [...agents.values()], coverage, complete };
}
