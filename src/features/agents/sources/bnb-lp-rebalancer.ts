import type {
  AgentIdentity,
  EvidenceValue,
  RebalancingEvidence,
  SourceStamp,
  TransactionReceipt,
} from "../domain";

const SERVICE_ORIGIN = "https://bnb-lp-api.172-104-171-139.nip.io";
const READ_PATHS = [
  "/health",
  "/metadata",
  "/status",
  "/strategy",
  "/performance",
  "/positions",
  "/transactions",
] as const;
const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const HASH_PATTERN = /^(?:0x)?[a-fA-F0-9]{64}$/;

type ReadPath = (typeof READ_PATHS)[number];

interface EndpointResult {
  path: ReadPath;
  data?: Record<string, unknown>;
  failure?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function numberValue(record: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = record?.[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function stringValue(record: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value : undefined;
}

function booleanValue(record: Record<string, unknown> | undefined, key: string): boolean | undefined {
  const value = record?.[key];
  return typeof value === "boolean" ? value : undefined;
}

function nestedRecord(record: Record<string, unknown> | undefined, key: string): Record<string, unknown> | undefined {
  const value = record?.[key];
  return isRecord(value) ? value : undefined;
}

function evidenceValue(
  value: number | undefined,
  definition: string,
  source: SourceStamp,
  details: Pick<EvidenceValue<number>, "windowSeconds" | "windowComplete"> = {},
): EvidenceValue<number> | undefined {
  return value === undefined
    ? undefined
    : {
        value,
        definition,
        observedAt: source.observedAt,
        source,
        ...details,
      };
}

async function fetchEndpoint(path: ReadPath, fetcher: typeof fetch): Promise<EndpointResult> {
  let response: Response;
  try {
    response = await fetcher(`${SERVICE_ORIGIN}${path}`, {
      method: "GET",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    return { path, failure: `${path} request failed` };
  }

  if (!response.ok) {
    return { path, failure: `${path} returned HTTP ${response.status}` };
  }

  try {
    const payload: unknown = await response.json();
    return isRecord(payload)
      ? { path, data: payload }
      : { path, failure: `${path} returned an invalid object` };
  } catch {
    return { path, failure: `${path} returned invalid JSON` };
  }
}

function buildReceipts(
  transactions: Record<string, unknown> | undefined,
  partialFailures: string[],
): TransactionReceipt[] {
  const entries = transactions?.transactions;
  if (!Array.isArray(entries)) {
    return [];
  }

  const hashes = entries.flatMap((entry) => {
    if (!isRecord(entry) || !Array.isArray(entry.txs)) {
      return [];
    }
    return entry.txs.filter((hash): hash is string => typeof hash === "string");
  });

  if (hashes.some((hash) => !HASH_PATTERN.test(hash))) {
    partialFailures.push("Transaction feed contained an invalid BSC hash");
    return [];
  }

  return hashes.map((hash) => {
    const canonicalHash = hash.startsWith("0x") ? hash : `0x${hash}`;
    return {
      hash: canonicalHash,
      explorerUrl: `https://bscscan.com/tx/${canonicalHash}`,
    };
  });
}

export async function fetchBnbLpRebalancerEvidence(
  identity: AgentIdentity,
  fetcher: typeof fetch = fetch,
): Promise<RebalancingEvidence> {
  const results = await Promise.all(READ_PATHS.map((path) => fetchEndpoint(path, fetcher)));
  const byPath = new Map(results.map((result) => [result.path, result.data]));
  const partialFailures = results.flatMap((result) => (result.failure ? [result.failure] : []));

  const health = byPath.get("/health");
  const metadata = byPath.get("/metadata");
  const status = byPath.get("/status");
  const strategy = byPath.get("/strategy");
  const performance = byPath.get("/performance");
  const positions = byPath.get("/positions");
  const transactions = byPath.get("/transactions");
  const parameters = nestedRecord(strategy, "parameters");
  const targetRange = nestedRecord(strategy, "target_range_if_rebalanced_now");

  const observedAt =
    stringValue(health, "last_check") ?? stringValue(status, "last_check") ?? new Date().toISOString();
  const source: SourceStamp = {
    sourceName: "BNB LP Range Rebalancer",
    sourceUrl: SERVICE_ORIGIN,
    observedAt,
  };
  const problems: string[] = [];

  const serviceChainId = numberValue(health, "chain_id");
  if (serviceChainId !== undefined && serviceChainId !== 56) {
    problems.push(`Service reported chain ${serviceChainId} instead of BSC mainnet 56`);
  }

  const walletAddress = stringValue(metadata, "wallet");
  if (walletAddress && ADDRESS_PATTERN.test(walletAddress)) {
    if (walletAddress.toLowerCase() !== identity.ownerAddress.toLowerCase()) {
      problems.push("Service wallet does not match ERC-8004 owner");
    }
  } else if (metadata) {
    problems.push("Service wallet is missing or invalid");
  }

  const positionEntries = positions?.positions;
  const position = Array.isArray(positionEntries) && isRecord(positionEntries[0])
    ? positionEntries[0]
    : undefined;
  const positionOwner = stringValue(position, "owner");
  if (positionOwner && ADDRESS_PATTERN.test(positionOwner) && positionOwner.toLowerCase() !== identity.ownerAddress.toLowerCase()) {
    problems.push("Managed position owner does not match ERC-8004 owner");
  }

  const positionTokenId = numberValue(position, "token_id") ?? numberValue(status, "token_id");
  const aprWindowSeconds = numberValue(status, "apr_window_seconds");
  const receipts = buildReceipts(transactions, partialFailures);

  return {
    erc8004AgentTokenId: identity.erc8004AgentTokenId,
    pancakePositionNftId: positionTokenId === undefined ? undefined : String(positionTokenId),
    source,
    chainId: serviceChainId ?? 56,
    walletAddress,
    problems,
    serviceVersion: stringValue(health, "version") ?? stringValue(metadata, "version"),
    network: stringValue(health, "network") ?? stringValue(status, "network"),
    blockNumber: numberValue(health, "block"),
    protocol: stringValue(metadata, "protocol") ?? stringValue(status, "protocol"),
    pair: stringValue(metadata, "pair") ?? stringValue(status, "pair"),
    inRange: booleanValue(status, "in_range"),
    lowerPrice: numberValue(status, "lower_price"),
    upperPrice: numberValue(status, "upper_price"),
    currentPrice: numberValue(status, "current_price"),
    rangePercent: numberValue(parameters, "range_pct"),
    triggerPercent: numberValue(parameters, "trigger_pct"),
    maxSlippagePercent: numberValue(parameters, "max_slippage_pct"),
    triggerSemantics: stringValue(strategy, "trigger_semantics"),
    targetLowerPrice: numberValue(targetRange, "lower_price"),
    targetUpperPrice: numberValue(targetRange, "upper_price"),
    tvl: evidenceValue(
      numberValue(performance, "tvl_usdt") ?? numberValue(status, "tvl"),
      "Operator-reported current position value",
      source,
    ),
    pendingFees: evidenceValue(
      numberValue(status, "pending_fees_usdt"),
      "Operator-reported pending USDT token fees",
      source,
    ),
    gasCost: evidenceValue(
      numberValue(performance, "gas_spent_usdt") ?? numberValue(status, "gas_cost"),
      "Operator-reported cumulative gas cost in USDT",
      source,
    ),
    pnl: evidenceValue(
      numberValue(performance, "pnl_usdt") ?? numberValue(status, "pnl"),
      "Operator-reported fees minus gas over available history",
      source,
      { windowSeconds: aprWindowSeconds, windowComplete: false },
    ),
    apr: evidenceValue(
      numberValue(status, "apr"),
      "Operator-annualised fee APR over the observed sample",
      source,
      { windowSeconds: aprWindowSeconds, windowComplete: false },
    ),
    rebalanceCount:
      numberValue(performance, "rebalance_count") ?? numberValue(status, "rebalance_count"),
    lastRebalanceAt:
      stringValue(performance, "last_rebalance") ?? stringValue(status, "last_rebalance"),
    riskControls: Array.isArray(metadata?.risk_controls)
      ? metadata.risk_controls.filter((control): control is string => typeof control === "string")
      : [],
    receipts,
    partialFailures,
  };
}
