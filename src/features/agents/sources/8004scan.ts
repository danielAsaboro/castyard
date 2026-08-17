import type { AgentIdentity, SourceStamp } from "../domain";

const API_ORIGIN = "https://8004scan.io";
const AGENTS_URL = `${API_ORIGIN}/api/v1/public/agents`;
const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

export type UpstreamErrorKind = "timeout" | "network" | "rate-limit" | "http" | "schema";

export class UpstreamError extends Error {
  readonly kind: UpstreamErrorKind;
  readonly status?: number;
  readonly retryAfter?: string;

  constructor(
    kind: UpstreamErrorKind,
    message: string,
    details: { status?: number; retryAfter?: string; cause?: unknown } = {},
  ) {
    super(message, { cause: details.cause });
    this.name = "UpstreamError";
    this.kind = kind;
    this.status = details.status;
    this.retryAfter = details.retryAfter;
  }
}

export interface AgentSearchResult {
  agents: AgentIdentity[];
  source: SourceStamp;
  pagination: {
    page: number;
    limit: number;
    total: number;
    hasMore: boolean;
  };
}

export interface FetchBscAgentsInput {
  search?: string;
  limit?: number;
  fetcher?: typeof fetch;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new UpstreamError("schema", `8004scan record is missing ${key}`);
  }
  return value;
}

function optionalNumber(record: Record<string, unknown>, key: string): number | undefined {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function assertAddress(value: string, label: string): string {
  if (!ADDRESS_PATTERN.test(value)) {
    throw new UpstreamError("schema", `8004scan ${label} is not an EVM address`);
  }
  return value.toLowerCase();
}

export function normalize8004Agent(input: unknown): AgentIdentity {
  if (!isRecord(input)) {
    throw new UpstreamError("schema", "8004scan agent record is not an object");
  }

  if (input.chain_id !== 56) {
    throw new UpstreamError("schema", "8004scan agent record is not on BSC mainnet");
  }

  const protocols = input.supported_protocols;
  if (!Array.isArray(protocols) || !protocols.every((protocol) => typeof protocol === "string")) {
    throw new UpstreamError("schema", "8004scan supported_protocols is invalid");
  }

  return {
    agentId: requiredString(input, "agent_id"),
    erc8004AgentTokenId: requiredString(input, "token_id"),
    chainId: 56,
    registryAddress: assertAddress(requiredString(input, "contract_address"), "registry address"),
    ownerAddress: assertAddress(requiredString(input, "owner_address"), "owner address"),
    name: requiredString(input, "name"),
    description: typeof input.description === "string" ? input.description : "",
    supportedProtocols: protocols,
    x402Supported: input.x402_supported === true,
    totalFeedbacks: optionalNumber(input, "total_feedbacks"),
    averageScore: optionalNumber(input, "average_score"),
    createdAt: typeof input.created_at === "string" ? input.created_at : undefined,
    updatedAt: typeof input.updated_at === "string" ? input.updated_at : undefined,
    source: {
      sourceName: "8004scan",
      sourceUrl: `${API_ORIGIN}/agents/bsc/${requiredString(input, "token_id")}`,
      observedAt: new Date().toISOString(),
    },
  };
}

function parsePagination(input: unknown): AgentSearchResult["pagination"] {
  if (!isRecord(input)) {
    throw new UpstreamError("schema", "8004scan pagination metadata is missing");
  }

  const { page, limit, total, hasMore } = input;
  if (
    typeof page !== "number" ||
    typeof limit !== "number" ||
    typeof total !== "number" ||
    typeof hasMore !== "boolean"
  ) {
    throw new UpstreamError("schema", "8004scan pagination metadata is invalid");
  }

  return { page, limit, total, hasMore };
}

export async function fetchBscAgents({
  search,
  limit = 10,
  fetcher = fetch,
}: FetchBscAgentsInput = {}): Promise<AgentSearchResult> {
  const url = new URL(AGENTS_URL);
  url.searchParams.set("chainId", "56");
  url.searchParams.set("limit", String(Math.min(10, Math.max(1, Math.trunc(limit)))));
  if (search?.trim()) {
    url.searchParams.set("search", search.trim());
  }

  let response: Response;
  try {
    response = await fetcher(url, {
      method: "GET",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
      next: { revalidate: 60 },
    } as RequestInit & { next: { revalidate: number } });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new UpstreamError("timeout", "8004scan request timed out", { cause: error });
    }
    throw new UpstreamError("network", "8004scan request failed", { cause: error });
  }

  if (response.status === 429) {
    throw new UpstreamError("rate-limit", "8004scan rate limit reached", {
      status: 429,
      retryAfter: response.headers.get("retry-after") ?? undefined,
    });
  }
  if (!response.ok) {
    throw new UpstreamError("http", `8004scan returned HTTP ${response.status}`, {
      status: response.status,
    });
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (error) {
    throw new UpstreamError("schema", "8004scan returned invalid JSON", { cause: error });
  }

  if (!isRecord(payload) || payload.success !== true || !Array.isArray(payload.data) || !isRecord(payload.meta)) {
    throw new UpstreamError("schema", "8004scan response envelope is invalid");
  }

  const upstreamAt = requiredString(payload.meta, "timestamp");
  const requestId = requiredString(payload.meta, "requestId");
  const source: SourceStamp = {
    sourceName: "8004scan",
    sourceUrl: url.toString(),
    observedAt: new Date().toISOString(),
    upstreamAt,
    requestId,
  };

  const agents = payload.data.map((record) => ({
    ...normalize8004Agent(record),
    source,
  }));

  return {
    agents,
    source,
    pagination: parsePagination(payload.meta.pagination),
  };
}
