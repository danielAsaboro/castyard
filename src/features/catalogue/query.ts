import { AGENT_CATEGORIES, type AgentCategory } from "@/features/agents/domain";

export const catalogueNetworks = ["all", "mainnet", "testnet"] as const;
export const catalogueEvidence = ["all", "registered", "claimed", "observed", "activatable"] as const;
export const catalogueRails = ["all", "erc8183", "x402"] as const;
export const catalogueSorts = ["relevance", "evidence", "freshness", "newest", "price-low", "price-high", "name"] as const;
export const cataloguePageSizes = [12, 24, 48] as const;

export type CatalogueNetwork = (typeof catalogueNetworks)[number];
export type CatalogueEvidence = (typeof catalogueEvidence)[number];
export type CatalogueRail = (typeof catalogueRails)[number];
export type CatalogueSort = (typeof catalogueSorts)[number];
export type CataloguePageSize = (typeof cataloguePageSizes)[number];

export interface CatalogueQuery {
  q: string;
  categories: AgentCategory[];
  network: CatalogueNetwork;
  evidence: CatalogueEvidence;
  rail: CatalogueRail;
  sort: CatalogueSort;
  page: number;
  perPage: CataloguePageSize;
}

type QueryInput = URLSearchParams | Record<string, string | string[] | undefined>;

function values(input: QueryInput, key: string): string[] {
  if (input instanceof URLSearchParams) return input.getAll(key);
  const value = input[key];
  return Array.isArray(value) ? value : value === undefined ? [] : [value];
}

function one(input: QueryInput, key: string): string {
  return values(input, key)[0] ?? "";
}

function member<T extends string>(value: string, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? value as T : fallback;
}

export function parseCatalogueQuery(input: QueryInput): CatalogueQuery {
  const categories = values(input, "category").filter((candidate): candidate is AgentCategory =>
    AGENT_CATEGORIES.some(({ slug }) => slug === candidate),
  );
  const parsedPage = Number.parseInt(one(input, "page"), 10);
  const parsedPageSize = Number.parseInt(one(input, "perPage"), 10);

  return {
    q: one(input, "q").trim().slice(0, 200),
    categories: [...new Set(categories)],
    network: member(one(input, "network"), catalogueNetworks, "all"),
    evidence: member(one(input, "evidence"), catalogueEvidence, "all"),
    rail: member(one(input, "rail"), catalogueRails, "all"),
    sort: member(one(input, "sort"), catalogueSorts, "relevance"),
    page: Number.isSafeInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1,
    perPage: cataloguePageSizes.includes(parsedPageSize as CataloguePageSize)
      ? parsedPageSize as CataloguePageSize
      : 24,
  };
}

export function serializeCatalogueQuery(query: CatalogueQuery): URLSearchParams {
  const output = new URLSearchParams();
  if (query.q) output.set("q", query.q);
  for (const category of query.categories) output.append("category", category);
  if (query.network !== "all") output.set("network", query.network);
  if (query.evidence !== "all") output.set("evidence", query.evidence);
  if (query.rail !== "all") output.set("rail", query.rail);
  if (query.sort !== "relevance") output.set("sort", query.sort);
  if (query.page !== 1) output.set("page", String(query.page));
  if (query.perPage !== 24) output.set("perPage", String(query.perPage));
  return output;
}
