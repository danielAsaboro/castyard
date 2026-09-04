import type { AgentSummary, CategoryClaim, EvidenceState } from "@/features/agents/domain";
import type { MarketplaceInventory } from "./inventory";
import type { CataloguePage } from "./search";
import type { CatalogueQuery } from "./query";

export interface PreparedCatalogueStatement {
  sql: string;
  bindings: Array<string | number>;
}

export interface CatalogueStatements {
  count: PreparedCatalogueStatement;
  rows: PreparedCatalogueStatement;
}

export interface D1Result<T = unknown> {
  results?: T[];
  success: boolean;
  meta?: { changes?: number };
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}

export interface D1DatabaseLike {
  prepare(sql: string): D1PreparedStatement;
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}

function safeWords(value: string): string[] {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en-US")
    .match(/[a-z0-9]+/g)
    ?.slice(0, 20) ?? [];
}

export function toFtsQuery(value: string): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("en-US");
  const parts: string[] = [];
  for (const match of normalized.matchAll(/"([^"]+)"|[a-z0-9]+/g)) {
    if (parts.length >= 20) break;
    if (match[1] !== undefined) {
      const phrase = safeWords(match[1]).join(" ");
      if (phrase) parts.push(`"${phrase}"`);
    } else {
      const term = match[0];
      if (term) parts.push(`"${term}"*`);
    }
  }
  return parts.join(" AND ");
}

const ORDER_BY: Record<CatalogueQuery["sort"], string> = {
  relevance: "relevance ASC, a.evidence_rank DESC, a.observed_at DESC",
  evidence: "a.evidence_rank DESC, a.observed_at DESC",
  freshness: "a.observed_at DESC, a.evidence_rank DESC",
  newest: "a.created_at DESC, a.evidence_rank DESC",
  "price-low": "a.price_amount IS NULL ASC, a.price_amount ASC",
  "price-high": "a.price_amount IS NULL ASC, a.price_amount DESC",
  name: "a.normalized_name ASC",
};

export function buildCatalogueStatements(query: CatalogueQuery): CatalogueStatements {
  const joins: string[] = [];
  const predicates = ["a.current = 1"];
  const bindings: Array<string | number> = [];
  const fts = toFtsQuery(query.q);

  if (fts) {
    joins.push("JOIN agents_fts ON agents_fts.rowid = a.rowid");
    predicates.push("agents_fts MATCH ?");
    bindings.push(fts);
  }
  if (query.categories.length) {
    predicates.push(`EXISTS (SELECT 1 FROM json_each(a.category_claims_json) AS category WHERE json_extract(category.value, '$.category') IN (${query.categories.map(() => "?").join(", ")}))`);
    bindings.push(...query.categories);
  }
  if (query.network !== "all") {
    predicates.push("a.network = ?");
    bindings.push(query.network);
  }
  if (query.evidence !== "all") {
    predicates.push("a.evidence_state = ?");
    bindings.push(query.evidence);
  }
  if (query.rail === "x402") {
    predicates.push("a.x402_supported = 1");
  } else if (query.rail === "erc8183") {
    predicates.push("a.erc8183_supported = 1");
  }

  const from = `FROM agents AS a ${joins.join(" ")} WHERE ${predicates.join(" AND ")}`;
  const relevance = fts ? "bm25(agents_fts, 12.0, 4.0, 2.0)" : "0";
  const order = `${ORDER_BY[query.sort]}, a.agent_id ASC`;
  const offset = (query.page - 1) * query.perPage;
  return {
    count: {
      sql: `SELECT COUNT(*) AS total ${from}`,
      bindings: [...bindings],
    },
    rows: {
      sql: `SELECT a.*, ${relevance} AS relevance ${from} ORDER BY ${order} LIMIT ? OFFSET ?`,
      bindings: [...bindings, query.perPage, offset],
    },
  };
}

const UPSERT_AGENT = `INSERT INTO agents (
  agent_id, token_id, chain_id, network, registry_address, owner_address, name,
  normalized_name, description, protocols_json, category_claims_json, search_text,
  x402_supported, erc8183_supported, evidence_state, evidence_rank, feedback_count,
  average_score, created_at, updated_at, observed_at, source_url, source_request_id,
  current, last_sync_id
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
ON CONFLICT(agent_id) DO UPDATE SET
  token_id=excluded.token_id, chain_id=excluded.chain_id, network=excluded.network,
  registry_address=excluded.registry_address, owner_address=excluded.owner_address,
  name=excluded.name, normalized_name=excluded.normalized_name,
  description=excluded.description, protocols_json=excluded.protocols_json,
  category_claims_json=excluded.category_claims_json, search_text=excluded.search_text,
  x402_supported=excluded.x402_supported, erc8183_supported=excluded.erc8183_supported,
  evidence_state=excluded.evidence_state, evidence_rank=excluded.evidence_rank,
  feedback_count=excluded.feedback_count, average_score=excluded.average_score,
  created_at=excluded.created_at, updated_at=excluded.updated_at,
  observed_at=excluded.observed_at, source_url=excluded.source_url,
  source_request_id=excluded.source_request_id, current=1, last_sync_id=excluded.last_sync_id`;

const UPSERT_SOURCE = `INSERT INTO agent_sources (
  agent_id, source_name, source_url, observed_at, upstream_at, request_id
) VALUES (?, ?, ?, ?, ?, ?)
ON CONFLICT(agent_id, source_name) DO UPDATE SET
  source_url=excluded.source_url, observed_at=excluded.observed_at,
  upstream_at=excluded.upstream_at, request_id=excluded.request_id`;

const EVIDENCE_RANK: Record<EvidenceState, number> = { registered: 0, claimed: 1, observed: 2 };
const CATALOGUE_REFRESH_INTERVAL_MS = 15 * 60_000;

export function isCatalogueRefreshDue(startedAt: string | undefined, nowMs = Date.now()): boolean {
  const parsed = startedAt ? Date.parse(startedAt) : Number.NaN;
  return !Number.isFinite(parsed) || nowMs - parsed >= CATALOGUE_REFRESH_INTERVAL_MS;
}

function normalizedName(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("en-US");
}

function evidenceState(value: unknown): EvidenceState {
  return value === "claimed" || value === "observed" ? value : "registered";
}

interface AgentRow {
  agent_id: string;
  token_id: string;
  chain_id: 56 | 97;
  network: "mainnet" | "testnet";
  registry_address: string;
  owner_address: string;
  name: string;
  description: string;
  protocols_json: string;
  category_claims_json: string;
  x402_supported: number;
  erc8183_supported: number;
  evidence_state: string;
  feedback_count: number | null;
  average_score: number | null;
  created_at: string | null;
  updated_at: string | null;
  observed_at: string;
  source_url: string;
  source_request_id: string | null;
  relevance: number;
}

function rowToSummary(row: AgentRow): AgentSummary {
  const state = evidenceState(row.evidence_state);
  return {
    identity: {
      agentId: row.agent_id,
      erc8004AgentTokenId: row.token_id,
      chainId: row.chain_id,
      isTestnet: row.network === "testnet",
      registryAddress: row.registry_address,
      ownerAddress: row.owner_address,
      name: row.name,
      description: row.description,
      supportedProtocols: JSON.parse(row.protocols_json) as string[],
      x402Supported: row.x402_supported === 1,
      totalFeedbacks: row.feedback_count ?? undefined,
      averageScore: row.average_score ?? undefined,
      createdAt: row.created_at ?? undefined,
      updatedAt: row.updated_at ?? undefined,
      source: {
        sourceName: "8004scan",
        sourceUrl: row.source_url,
        observedAt: row.observed_at,
        requestId: row.source_request_id ?? undefined,
      },
    },
    categoryClaims: JSON.parse(row.category_claims_json) as CategoryClaim[],
    evidenceState: state,
    activationRails: row.erc8183_supported === 1 ? ["erc8183"] : undefined,
    qualificationProblems: [],
  };
}

export class CatalogueRepository {
  constructor(private readonly db: D1DatabaseLike) {}

  async currentCount(): Promise<number> {
    const row = await this.db.prepare("SELECT COUNT(*) AS total FROM agents WHERE current = 1").first<{ total: number }>();
    return row?.total ?? 0;
  }

  async currentComplete(): Promise<boolean> {
    const row = await this.db.prepare(`SELECT complete FROM catalogue_sync_runs
      WHERE completed_at IS NOT NULL ORDER BY started_at DESC LIMIT 1`).first<{ complete: number }>();
    return row?.complete === 1;
  }

  async refreshDue(): Promise<boolean> {
    const row = await this.db.prepare(`SELECT started_at FROM catalogue_sync_runs
      WHERE completed_at IS NOT NULL ORDER BY started_at DESC LIMIT 1`).first<{ started_at: string }>();
    return isCatalogueRefreshDue(row?.started_at);
  }

  async replaceSyncSnapshot(result: MarketplaceInventory): Promise<string> {
    const syncId = crypto.randomUUID();
    const now = new Date().toISOString();
    const statements: D1PreparedStatement[] = [
      this.db.prepare(`INSERT INTO catalogue_sync_runs
        (sync_id, started_at, complete, coverage_json, indexed_count)
        VALUES (?, ?, 0, ?, 0)`).bind(syncId, now, JSON.stringify(result.coverage)),
    ];

    for (const summary of result.agents) {
      const { identity } = summary;
      const categories = summary.categoryClaims;
      const erc8183 = summary.activationRails?.includes("erc8183")
        || identity.supportedProtocols.some((protocol) => /erc[- ]?8183/i.test(protocol));
      const searchText = [
        categories.map(({ category, matchedPhrase }) => `${category} ${matchedPhrase}`).join(" "),
        identity.supportedProtocols.join(" "),
        identity.ownerAddress,
        identity.agentId,
      ].join(" ");
      statements.push(this.db.prepare(UPSERT_AGENT).bind(
        identity.agentId,
        identity.erc8004AgentTokenId,
        identity.chainId,
        identity.isTestnet ? "testnet" : "mainnet",
        identity.registryAddress,
        identity.ownerAddress,
        identity.name,
        normalizedName(identity.name),
        identity.description,
        JSON.stringify(identity.supportedProtocols),
        JSON.stringify(categories),
        searchText,
        identity.x402Supported ? 1 : 0,
        erc8183 ? 1 : 0,
        summary.evidenceState,
        EVIDENCE_RANK[summary.evidenceState],
        identity.totalFeedbacks ?? null,
        identity.averageScore ?? null,
        identity.createdAt ?? null,
        identity.updatedAt ?? null,
        identity.source.observedAt,
        identity.source.sourceUrl,
        identity.source.requestId ?? null,
        syncId,
      ));
      statements.push(this.db.prepare(UPSERT_SOURCE).bind(
        identity.agentId,
        identity.source.sourceName,
        identity.source.sourceUrl,
        identity.source.observedAt,
        identity.source.upstreamAt ?? null,
        identity.source.requestId ?? null,
      ));
    }

    for (let index = 0; index < statements.length; index += 50) {
      await this.db.batch(statements.slice(index, index + 50));
    }
    if (result.complete) {
      await this.db.prepare("UPDATE agents SET current = 0 WHERE last_sync_id <> ?").bind(syncId).run();
    }
    await this.db.prepare(`UPDATE catalogue_sync_runs
      SET completed_at = ?, complete = ?, indexed_count = ? WHERE sync_id = ?`)
      .bind(new Date().toISOString(), result.complete ? 1 : 0, result.agents.length, syncId)
      .run();
    return syncId;
  }

  async search(query: CatalogueQuery): Promise<CataloguePage> {
    const initial = buildCatalogueStatements(query);
    const count = await this.db.prepare(initial.count.sql).bind(...initial.count.bindings).first<{ total: number }>();
    const total = count?.total ?? 0;
    const pageCount = total === 0 ? 0 : Math.ceil(total / query.perPage);
    const page = pageCount === 0 ? 1 : Math.min(query.page, pageCount);
    const boundedQuery = page === query.page ? query : { ...query, page };
    const statements = buildCatalogueStatements(boundedQuery);
    const rows = await this.db.prepare(statements.rows.sql).bind(...statements.rows.bindings).all<AgentRow>();
    const results = rows.results ?? [];
    const offset = (page - 1) * query.perPage;
    return {
      items: results.map((row) => ({
        agent: rowToSummary(row),
        score: Number.isFinite(row.relevance) ? -row.relevance : 0,
        matchReason: query.q || "All current records",
      })),
      total,
      page,
      perPage: query.perPage,
      pageCount,
      from: total === 0 ? 0 : offset + 1,
      to: total === 0 ? 0 : offset + results.length,
    };
  }
}
