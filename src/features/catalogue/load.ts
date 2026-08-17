import type { CatalogueSyncResult } from "./sync";
import type { MarketplaceInventory } from "./inventory";
import type { CatalogueQuery } from "./query";
import type { CataloguePage } from "./search";
import { queryCatalogue } from "./search";

export interface CatalogueReader {
  currentCount(): Promise<number>;
  currentComplete?(): Promise<boolean>;
  refreshDue?(): Promise<boolean>;
  search(query: CatalogueQuery): Promise<CataloguePage>;
  replaceSyncSnapshot?(result: CatalogueSyncResult): Promise<string>;
}

export interface CatalogueLoadDependencies {
  repository?: CatalogueReader;
  fallback(): Promise<MarketplaceInventory>;
}

export interface LoadedCatalogue {
  page: CataloguePage;
  source: "index" | "index-partial" | "live-bootstrap";
}

export async function loadCatalogue(
  query: CatalogueQuery,
  dependencies: CatalogueLoadDependencies,
): Promise<LoadedCatalogue> {
  if (dependencies.repository && await dependencies.repository.currentCount() > 0) {
    const complete = dependencies.repository.currentComplete
      ? await dependencies.repository.currentComplete()
      : true;
    const shouldRetry = !complete && dependencies.repository.refreshDue
      ? await dependencies.repository.refreshDue()
      : false;
    if (!shouldRetry || !dependencies.repository.replaceSyncSnapshot) {
      return {
        page: await dependencies.repository.search(query),
        source: complete ? "index" : "index-partial",
      };
    }
  }
  const inventory = await dependencies.fallback();
  if (dependencies.repository?.replaceSyncSnapshot && inventory.agents.length > 0) {
    await dependencies.repository.replaceSyncSnapshot({
      agents: inventory.agents.map(({ identity }) => identity),
      coverage: inventory.coverage,
      complete: inventory.complete,
    });
    return {
      page: await dependencies.repository.search(query),
      source: inventory.complete ? "index" : "index-partial",
    };
  }
  return { page: queryCatalogue(inventory.agents, query), source: "live-bootstrap" };
}
