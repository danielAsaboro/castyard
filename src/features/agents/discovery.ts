import { AGENT_CATEGORIES, type AgentSummary, type SourceStamp } from "./domain";
import { qualifyAgent } from "./qualify";
import { fetchBscAgents, UpstreamError } from "./sources/8004scan";
import type { CatalogueReader } from "@/features/catalogue/load";
import type { CatalogueQuery } from "@/features/catalogue/query";

const SEARCHES = [
  { category: AGENT_CATEGORIES[0], search: "rebalancing" },
  { category: AGENT_CATEGORIES[1], search: "grid trading" },
  { category: AGENT_CATEGORIES[2], search: "yield optimization" },
  { category: AGENT_CATEGORIES[3], search: "health factor" },
] as const;

export type DiscoveryStatus = "ready" | "empty" | "rate-limit" | "error";

export interface CategoryDiscovery {
  category: (typeof AGENT_CATEGORIES)[number];
  agents: AgentSummary[];
  status: DiscoveryStatus;
  source?: SourceStamp;
  retryAfter?: string;
}

export interface DiscoveryResult {
  categories: CategoryDiscovery[];
  uniqueAgents: AgentSummary[];
}

const indexedQuery: Omit<CatalogueQuery, "categories"> = {
  q: "",
  network: "all",
  evidence: "all",
  rail: "all",
  sort: "evidence",
  page: 1,
  perPage: 12,
};

export async function loadIndexedDiscovery(
  repository: Pick<CatalogueReader, "currentCount" | "search">,
): Promise<DiscoveryResult | undefined> {
  if (await repository.currentCount() === 0) return undefined;
  const categories = await Promise.all(AGENT_CATEGORIES.map(async (category) => {
    const page = await repository.search({ ...indexedQuery, categories: [category.slug] });
    const agents = page.items.map(({ agent }) => agent);
    return {
      category,
      agents,
      status: agents.length > 0 ? "ready" as const : "empty" as const,
      source: agents[0]?.identity.source,
    };
  }));
  const unique = new Map<string, AgentSummary>();
  for (const category of categories) {
    for (const agent of category.agents) unique.set(agent.identity.agentId, agent);
  }
  return { categories, uniqueAgents: [...unique.values()] };
}

async function loadCategory(
  entry: (typeof SEARCHES)[number],
  fetcher: typeof fetch,
): Promise<CategoryDiscovery> {
  try {
    const result = await fetchBscAgents({ search: entry.search, limit: 10, fetcher });
    const agents = result.agents
      .map((agent) => qualifyAgent(agent))
      .filter((agent) =>
        agent.categoryClaims.some((claim) => claim.category === entry.category.slug),
      );
    return {
      category: entry.category,
      agents,
      status: agents.length > 0 ? "ready" : "empty",
      source: result.source,
    };
  } catch (error) {
    if (error instanceof UpstreamError && error.kind === "rate-limit") {
      return {
        category: entry.category,
        agents: [],
        status: "rate-limit",
        retryAfter: error.retryAfter,
      };
    }
    return { category: entry.category, agents: [], status: "error" };
  }
}

export async function loadDiscovery(fetcher: typeof fetch = fetch): Promise<DiscoveryResult> {
  const categories = await Promise.all(SEARCHES.map((entry) => loadCategory(entry, fetcher)));
  const byAgentId = new Map<string, AgentSummary>();
  for (const category of categories) {
    for (const agent of category.agents) {
      byAgentId.set(agent.identity.agentId, agent);
    }
  }
  return { categories, uniqueAgents: [...byAgentId.values()] };
}
