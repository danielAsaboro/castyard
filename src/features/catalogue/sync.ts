import type { AgentIdentity } from "@/features/agents/domain";
import { fetchBscAgents, UpstreamError, type UpstreamErrorKind } from "@/features/agents/sources/8004scan";

export interface NetworkCoverage {
  chainId: 56 | 97;
  search?: string;
  status: "complete" | "partial";
  pagesFetched: number;
  reportedTotal: number;
  errorKind?: UpstreamErrorKind;
}

export interface CatalogueSyncResult {
  agents: AgentIdentity[];
  coverage: NetworkCoverage[];
  complete: boolean;
}

export interface CompleteCatalogueInput {
  chainIds?: readonly (56 | 97)[];
  search?: string;
  fetcher?: typeof fetch;
}

export async function fetchCompleteBscCatalogue({
  chainIds = [56, 97],
  search,
  fetcher = fetch,
}: CompleteCatalogueInput = {}): Promise<CatalogueSyncResult> {
  const agents = new Map<string, AgentIdentity>();
  const coverage: NetworkCoverage[] = [];

  for (const chainId of chainIds) {
    let page = 1;
    let pagesFetched = 0;
    let reportedTotal = 0;
    let status: NetworkCoverage["status"] = "complete";
    let errorKind: UpstreamErrorKind | undefined;

    try {
      while (page <= 1_000) {
        const result = await fetchBscAgents({ chainId, page, limit: 50, search, fetcher });
        pagesFetched += 1;
        reportedTotal = Math.max(reportedTotal, result.pagination.total);
        for (const agent of result.agents) agents.set(agent.agentId, agent);
        if (!result.pagination.hasMore) break;
        page += 1;
      }
      if (page > 1_000) {
        throw new UpstreamError("schema", "8004scan pagination exceeded the safety limit");
      }
    } catch (error) {
      status = "partial";
      errorKind = error instanceof UpstreamError ? error.kind : "network";
    }

    coverage.push({
      chainId,
      ...(search ? { search } : {}),
      status,
      pagesFetched,
      reportedTotal,
      ...(errorKind ? { errorKind } : {}),
    });
  }

  return {
    agents: [...agents.values()],
    coverage,
    complete: coverage.every(({ status }) => status === "complete"),
  };
}
