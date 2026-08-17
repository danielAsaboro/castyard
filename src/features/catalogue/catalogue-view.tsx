import Link from "next/link";

import { AgentCard } from "@/features/agents/agent-card";
import type { AGENT_CATEGORIES, AgentCategory } from "@/features/agents/domain";
import {
  catalogueEvidence,
  catalogueNetworks,
  cataloguePageSizes,
  catalogueRails,
  catalogueSorts,
  serializeCatalogueQuery,
  type CatalogueQuery,
} from "./query";
import type { CataloguePage } from "./search";

type CategoryDefinition = (typeof AGENT_CATEGORIES)[number];

const LABELS: Record<string, string> = {
  all: "All",
  mainnet: "BSC mainnet",
  testnet: "BSC testnet",
  registered: "Registered",
  claimed: "Claimed",
  observed: "Observed",
  activatable: "Activatable",
  erc8183: "ERC-8183",
  x402: "x402",
  relevance: "Relevance",
  evidence: "Evidence quality",
  freshness: "Freshness",
  newest: "Newest registration",
  "price-low": "Price: low to high",
  "price-high": "Price: high to low",
  name: "Name",
};

function href(query: CatalogueQuery, change: Partial<CatalogueQuery>): string {
  const params = serializeCatalogueQuery({ ...query, page: 1, ...change });
  const serialized = params.toString();
  return serialized ? `/agents?${serialized}` : "/agents";
}

function pageHref(query: CatalogueQuery, page: number): string {
  const params = serializeCatalogueQuery({ ...query, page });
  return `/agents?${params.toString()}`;
}

function visiblePages(current: number, total: number): number[] {
  const pages = new Set([1, total, current - 1, current, current + 1]);
  return [...pages].filter((page) => page >= 1 && page <= total).sort((a, b) => a - b);
}

export function CatalogueView({
  categories,
  query,
  result,
}: {
  categories: readonly CategoryDefinition[];
  query: CatalogueQuery;
  result: CataloguePage;
}) {
  const activeFilters = [
    ...(query.q ? [{ key: "q", label: `Search: ${query.q}`, remove: { q: "" } }] : []),
    ...query.categories.map((category) => ({
      key: `category-${category}`,
      label: categories.find(({ slug }) => slug === category)?.label ?? category,
      remove: { categories: query.categories.filter((item) => item !== category) },
    })),
    ...(query.network !== "all" ? [{ key: "network", label: LABELS[query.network], remove: { network: "all" as const } }] : []),
    ...(query.evidence !== "all" ? [{ key: "evidence", label: LABELS[query.evidence], remove: { evidence: "all" as const } }] : []),
    ...(query.rail !== "all" ? [{ key: "rail", label: LABELS[query.rail], remove: { rail: "all" as const } }] : []),
  ];

  return (
    <div className="catalogue-layout">
      <aside className="catalogue-filters paper-panel" aria-label="Marketplace filters">
        <form action="/agents" method="get">
          <label className="catalogue-search">
            Search agents
            <input type="search" name="q" defaultValue={query.q} placeholder="Try “grid trading” or an agent ID" />
          </label>

          <fieldset>
            <legend>Categories</legend>
            {categories.map((category) => (
              <label className="check-filter" key={category.slug}>
                <input
                  type="checkbox"
                  name="category"
                  value={category.slug}
                  defaultChecked={query.categories.includes(category.slug as AgentCategory)}
                />
                {category.label}
              </label>
            ))}
          </fieldset>

          <label>Network
            <select name="network" defaultValue={query.network}>
              {catalogueNetworks.map((value) => <option key={value} value={value}>{LABELS[value]}</option>)}
            </select>
          </label>
          <label>Evidence
            <select name="evidence" defaultValue={query.evidence}>
              {catalogueEvidence.map((value) => <option key={value} value={value}>{LABELS[value]}</option>)}
            </select>
          </label>
          <label>Payment rail
            <select name="rail" defaultValue={query.rail}>
              {catalogueRails.map((value) => <option key={value} value={value}>{LABELS[value]}</option>)}
            </select>
          </label>
          <button className="button-primary" type="submit">Apply filters</button>
          <Link className="clear-filters" href="/agents">Clear all filters</Link>
        </form>
      </aside>

      <div className="catalogue-results">
        <div className="catalogue-toolbar">
          <p className="result-count">{result.from}–{result.to} of {result.total.toLocaleString("en-US")} agents</p>
          <form action="/agents" method="get" className="catalogue-sort-form">
            {query.q ? <input type="hidden" name="q" value={query.q} /> : null}
            {query.categories.map((category) => <input type="hidden" name="category" value={category} key={category} />)}
            {query.network !== "all" ? <input type="hidden" name="network" value={query.network} /> : null}
            {query.evidence !== "all" ? <input type="hidden" name="evidence" value={query.evidence} /> : null}
            {query.rail !== "all" ? <input type="hidden" name="rail" value={query.rail} /> : null}
            <label>Sort results
              <select name="sort" defaultValue={query.sort}>
                {catalogueSorts.map((value) => <option key={value} value={value}>{LABELS[value]}</option>)}
              </select>
            </label>
            <label>Results per page
              <select name="perPage" defaultValue={String(query.perPage)}>
                {cataloguePageSizes.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <button type="submit">Update</button>
          </form>
        </div>

        {activeFilters.length ? (
          <div className="active-filters" aria-label="Active filters">
            {activeFilters.map((filter) => (
              <Link href={href(query, filter.remove)} key={filter.key}>
                <span className="active-filter-label">{filter.label}</span><span aria-hidden="true"> ×</span>
              </Link>
            ))}
          </div>
        ) : null}

        {result.items.length ? (
          <div className="agent-inventory">
            {result.items.map(({ agent }) => <AgentCard agent={agent} key={agent.identity.agentId} />)}
          </div>
        ) : (
          <div className="catalogue-empty paper-panel" role="status">
            <h2>No live agents match this search.</h2>
            <p>Remove a filter or try a broader English phrase. Castyard does not insert example agents into empty results.</p>
          </div>
        )}

        {result.pageCount > 1 ? (
          <nav className="pagination" aria-label="Catalogue pages">
            {result.page > 1 ? <Link href={pageHref(query, result.page - 1)} aria-label="Previous page">Previous</Link> : null}
            {visiblePages(result.page, result.pageCount).map((page, index, pages) => (
              <span key={page} className="pagination-slot">
                {index > 0 && page - pages[index - 1] > 1 ? <span aria-hidden="true">…</span> : null}
                <Link href={pageHref(query, page)} aria-label={`Page ${page}`} aria-current={page === result.page ? "page" : undefined}>{page}</Link>
              </span>
            ))}
            {result.page < result.pageCount ? <Link href={pageHref(query, result.page + 1)} aria-label="Next page">Next</Link> : null}
          </nav>
        ) : null}
      </div>
    </div>
  );
}
