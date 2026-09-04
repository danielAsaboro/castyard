import type { Metadata } from "next";
import { after } from "next/server";

import { ensureCatalogueSchema, getCatalogueRepository } from "@/../db";
import { AGENT_CATEGORIES } from "@/features/agents/domain";
import { CatalogueView } from "@/features/catalogue/catalogue-view";
import { loadMarketplaceInventory } from "@/features/catalogue/inventory";
import { loadCatalogue } from "@/features/catalogue/load";
import { parseCatalogueQuery } from "@/features/catalogue/query";
import type { CatalogueRepository } from "@/features/catalogue/repository";

export const metadata: Metadata = { title: "Discover live BSC agents" };
export const revalidate = 60;

type AgentSearchParams = Record<string, string | string[] | undefined>;

export default async function AgentsPage({ searchParams }: { searchParams: Promise<AgentSearchParams> }) {
  const query = parseCatalogueQuery(await searchParams);
  let repository: CatalogueRepository | undefined;
  try {
    await ensureCatalogueSchema();
    repository = getCatalogueRepository();
  } catch {
    repository = undefined;
  }
  const catalogue = await loadCatalogue(query, {
    repository,
    fallback: () => loadMarketplaceInventory(),
    scheduleRefresh: (task) => after(task),
  });

  return (
    <section className="container route-page catalogue-page">
      <p className="eyebrow">Live BSC agent marketplace</p>
      <h1 className="section-title">Find the agent that fits the job.</h1>
      <p className="lede">
        Search published ERC-8004 identities in plain English, narrow the evidence,
        and inspect the source before activation.
      </p>
      <div className={`catalogue-source-state source-${catalogue.source}`} role="status">
        {catalogue.source === "index"
          ? "Search index complete across all judged category queries on BSC mainnet and testnet. Individual records retain their own freshness labels."
          : catalogue.source === "index-stale"
            ? "Serving the last complete source snapshot while a background refresh checks every judged category query."
          : catalogue.source === "index-partial"
            ? "A source refresh was incomplete. Successful records remain visible and are not relabelled current."
            : "The durable index is unavailable. Showing current, source-fetched judged-category records without fixtures."}
      </div>
      <CatalogueView categories={AGENT_CATEGORIES} query={query} result={catalogue.page} />
    </section>
  );
}
