import { retryDelayMs } from "./rate-limit.mjs";

const REGISTRY_URL = "https://8004scan.io/api/v1/public/agents?chainId=56&search=265375&limit=10";
const OPERATOR_ORIGIN = "https://bnb-lp-api.172-104-171-139.nip.io";
const ENDPOINTS = ["/health", "/metadata", "/status", "/strategy", "/performance", "/positions", "/transactions"];
const AGENT_ID = "56:0x8004a169fb4a3325136eb29fa0ceb6d2e539a432:265375";
const HASH = /^(?:0x)?[a-f0-9]{64}$/i;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function getJson(url, retries = 1) {
  const parsed = new URL(url);
  assert(parsed.protocol === "https:", `Refusing non-HTTPS source: ${url}`);
  assert(parsed.origin === "https://8004scan.io" || parsed.origin === OPERATOR_ORIGIN, `Refusing unapproved source: ${url}`);
  const response = await fetch(parsed, { method: "GET", headers: { accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
  if (response.status === 429 && retries > 0) {
    const delay = retryDelayMs(response.headers);
    assert(delay !== null && delay <= 59_000, `8004scan rate-limited until ${response.headers.get("x-ratelimit-reset") ?? "an unpublished time"}`);
    await new Promise((resolve) => setTimeout(resolve, delay));
    return getJson(url, retries - 1);
  }
  assert(response.ok, `${parsed.pathname} returned HTTP ${response.status}`);
  return response.json();
}

const registry = await getJson(REGISTRY_URL);
assert(registry?.success === true && Array.isArray(registry.data), "8004scan envelope is invalid");
const identity = registry.data.find((record) => record.agent_id === AGENT_ID);
assert(identity, "Exact BSC ERC-8004 identity is absent");
assert(identity.chain_id === 56, "Registry identity is not on BSC mainnet");

const operator = Object.fromEntries(await Promise.all(ENDPOINTS.map(async (endpoint) => [endpoint, await getJson(`${OPERATOR_ORIGIN}${endpoint}`)])));
const health = operator["/health"];
const metadata = operator["/metadata"];
const positions = operator["/positions"];
const transactions = operator["/transactions"];
assert(health.chain_id === 56 && health.network === "bsc-mainnet", "Operator health reports the wrong chain");
assert(metadata.wallet?.toLowerCase() === identity.owner_address.toLowerCase(), "Operator wallet does not match the ERC-8004 owner");
const position = positions.positions?.[0];
assert(position?.owner?.toLowerCase() === identity.owner_address.toLowerCase(), "PancakeSwap position owner does not match the ERC-8004 owner");
assert(String(identity.token_id) !== String(position.token_id), "ERC-8004 token ID was conflated with the PancakeSwap position NFT ID");
const hashes = (transactions.transactions ?? []).flatMap((transaction) => transaction.txs ?? []);
assert(hashes.length > 0 && hashes.every((hash) => HASH.test(hash)), "No valid transaction receipts were returned");
const explorerUrls = (transactions.transactions ?? []).flatMap((transaction) => transaction.explorer_urls ?? []);
assert(explorerUrls.length === hashes.length && explorerUrls.every((url) => new URL(url).hostname === "bscscan.com"), "Receipt explorer provenance is invalid");

console.log(JSON.stringify({
  ok: true,
  checkedAt: new Date().toISOString(),
  registryAgentId: identity.agent_id,
  erc8004AgentTokenId: String(identity.token_id),
  pancakePositionNftId: String(position.token_id),
  ownerAddress: identity.owner_address.toLowerCase(),
  operatorVersion: metadata.version,
  operatorBlock: health.block,
  endpointsChecked: ENDPOINTS.length,
  receiptCount: hashes.length,
}, null, 2));
