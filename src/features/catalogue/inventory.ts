import type { AgentSummary } from "@/features/agents/domain";
import { qualifyAgent } from "@/features/agents/qualify";
import { fetchCompleteBscCatalogue, type NetworkCoverage } from "./sync";
import {
  REFERENCE_SELLER_AGENT_ID,
  REFERENCE_SELLER_ORIGIN,
  REFERENCE_SELLER_TOKEN_ID,
} from "@/features/activation/contracts";
import { fetchReferenceSellerSummary } from "@/features/reference-seller/discovery";

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

  const reference = await fetchCompleteBscCatalogue({ chainIds: [97], search: REFERENCE_SELLER_TOKEN_ID, fetcher });
  coverage.push(...reference.coverage);
  complete = complete && reference.complete;
  const referenceIdentity = reference.agents.find(({ agentId }) => agentId === REFERENCE_SELLER_AGENT_ID);
  if (referenceIdentity) {
    try {
      const summary = await fetchReferenceSellerSummary(referenceIdentity, fetcher, REFERENCE_SELLER_ORIGIN);
      agents.set(referenceIdentity.agentId, summary);
    } catch {
      complete = false;
    }
  } else if (reference.complete) {
    complete = false;
  }

  return { agents: [...agents.values()], coverage, complete };
}
