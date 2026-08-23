import type { AgentSummary, EvidenceState } from "@/features/agents/domain";
import type { CatalogueQuery } from "./query";

export interface CatalogueHit {
  agent: AgentSummary;
  score: number;
  matchReason: string;
}

export interface CataloguePage {
  items: CatalogueHit[];
  total: number;
  page: number;
  perPage: number;
  pageCount: number;
  from: number;
  to: number;
}

const EVIDENCE_RANK: Record<EvidenceState | "activatable", number> = {
  registered: 0,
  claimed: 1,
  observed: 2,
  activatable: 3,
};

function normalize(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function stem(word: string): string {
  return word
    .replace(/isations?$/, "ize")
    .replace(/izations?$/, "ize")
    .replace(/ising$/, "ize")
    .replace(/izing$/, "ize")
    .replace(/isers?$/, "ize")
    .replace(/izers?$/, "ize")
    .replace(/ies$/, "y")
    .replace(/s$/, "");
}

function tokens(value: string): string[] {
  const normalized = normalize(value);
  return normalized ? normalized.split(" ").map(stem) : [];
}

function queryParts(value: string): { phrases: string[]; terms: string[] } {
  const phrases = [...value.matchAll(/"([^"]+)"/g)]
    .map((match) => normalize(match[1]))
    .filter(Boolean);
  const remainder = value.replace(/"[^"]+"/g, " ");
  return { phrases, terms: tokens(remainder) };
}

function includesAll(haystack: Set<string>, needles: string[]): boolean {
  return needles.every((needle) => haystack.has(needle));
}

function searchable(agent: AgentSummary) {
  const categoryText = agent.categoryClaims.map(({ category, matchedPhrase }) => `${category} ${matchedPhrase}`).join(" ");
  const metadataText = `${categoryText} ${agent.identity.supportedProtocols.join(" ")} ${agent.identity.ownerAddress} ${agent.identity.agentId}`;
  const name = normalize(agent.identity.name);
  const description = normalize(agent.identity.description);
  const all = `${name} ${description} ${normalize(metadataText)}`.trim();
  return {
    name,
    description,
    all,
    nameTokens: new Set(tokens(name)),
    descriptionTokens: new Set(tokens(description)),
    metadataTokens: new Set(tokens(metadataText)),
    allTokens: new Set(tokens(all)),
  };
}

function searchHit(agent: AgentSummary, rawQuery: string): Omit<CatalogueHit, "agent"> | undefined {
  if (!rawQuery.trim()) return { score: 0, matchReason: "All current records" };
  const parts = queryParts(rawQuery);
  const document = searchable(agent);
  if (!parts.phrases.every((phrase) => document.all.includes(phrase))) return undefined;
  if (!includesAll(document.allTokens, parts.terms)) return undefined;

  let score = parts.phrases.length * 24;
  for (const term of parts.terms) {
    if (document.nameTokens.has(term)) score += 10;
    if (document.descriptionTokens.has(term)) score += 4;
    if (document.metadataTokens.has(term)) score += 2;
  }
  const reason = parts.phrases[0] ?? parts.terms.join(" ");
  return { score, matchReason: reason };
}

function timeValue(agent: AgentSummary): number {
  const value = agent.identity.source.upstreamAt ?? agent.identity.updatedAt ?? agent.identity.createdAt;
  const parsed = value ? Date.parse(value) : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

function canonicalOrder(left: CatalogueHit, right: CatalogueHit): number {
  return left.agent.identity.agentId.localeCompare(right.agent.identity.agentId, "en-US");
}

function sortHits(hits: CatalogueHit[], query: CatalogueQuery): CatalogueHit[] {
  return hits.sort((left, right) => {
    const leftAgent = left.agent;
    const rightAgent = right.agent;
    let comparison = 0;
    if (query.sort === "relevance") comparison = right.score - left.score;
    if (query.sort === "evidence") comparison = EVIDENCE_RANK[rightAgent.evidenceState] - EVIDENCE_RANK[leftAgent.evidenceState];
    if (query.sort === "freshness" || query.sort === "newest") comparison = timeValue(rightAgent) - timeValue(leftAgent);
    if (query.sort === "name") comparison = leftAgent.identity.name.localeCompare(rightAgent.identity.name, "en-US", { sensitivity: "base" });
    return comparison || canonicalOrder(left, right);
  });
}

function matchesFacets(agent: AgentSummary, query: CatalogueQuery): boolean {
  if (query.categories.length && !query.categories.some((category) => agent.categoryClaims.some((claim) => claim.category === category))) return false;
  if (query.network === "mainnet" && agent.identity.chainId !== 56) return false;
  if (query.network === "testnet" && agent.identity.chainId !== 97) return false;
  if (query.evidence !== "all" && agent.evidenceState !== query.evidence) return false;
  const erc8183 = agent.activationRails?.includes("erc8183")
    || agent.identity.supportedProtocols.some((protocol) => normalize(protocol).includes("erc 8183"));
  if (query.rail === "erc8183" && !erc8183) return false;
  if (query.rail === "x402" && !agent.identity.x402Supported) return false;
  return true;
}

export function queryCatalogue(agents: AgentSummary[], query: CatalogueQuery): CataloguePage {
  const hits = sortHits(agents.flatMap((agent) => {
    if (!matchesFacets(agent, query)) return [];
    const match = searchHit(agent, query.q);
    return match ? [{ agent, ...match }] : [];
  }), query);
  const total = hits.length;
  const pageCount = total === 0 ? 0 : Math.ceil(total / query.perPage);
  const page = pageCount === 0 ? 1 : Math.min(query.page, pageCount);
  const offset = (page - 1) * query.perPage;
  const items = hits.slice(offset, offset + query.perPage);
  return {
    items,
    total,
    page,
    perPage: query.perPage,
    pageCount,
    from: total === 0 ? 0 : offset + 1,
    to: total === 0 ? 0 : offset + items.length,
  };
}
