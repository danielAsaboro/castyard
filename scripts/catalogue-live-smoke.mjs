import { retryDelayMs } from "./rate-limit.mjs";

const API = "https://8004scan.io/api/v1/public/agents";
const SITE = process.env.CASTYARD_SITE_URL ?? "https://castyard-agents.asaborodaniel.chatgpt.site";
const SEARCHES = ["rebalancing", "grid trading", "yield optimization", "yield optimisation", "health factor"];
const CHAINS = [56, 97];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function get(url, retries = 2) {
  const response = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
  if (response.status === 429 && retries > 0) {
    const delay = retryDelayMs(response.headers);
    assert(delay !== null && delay <= 59_000, "8004scan rate limit has no bounded recovery time");
    await new Promise((resolve) => setTimeout(resolve, delay));
    return get(url, retries - 1);
  }
  assert(response.ok, `${url} returned HTTP ${response.status}`);
  return response;
}

const identities = new Map();
const coverage = [];
for (const search of SEARCHES) {
  for (const chainId of CHAINS) {
    let page = 1;
    let pages = 0;
    let reportedTotal = 0;
    while (page <= 20) {
      const url = new URL(API);
      url.searchParams.set("chainId", String(chainId));
      url.searchParams.set("search", search);
      url.searchParams.set("limit", "50");
      url.searchParams.set("page", String(page));
      const payload = await (await get(url)).json();
      assert(payload?.success === true && Array.isArray(payload.data), "Invalid 8004scan envelope");
      assert(payload.meta?.pagination?.page === page, "8004scan returned an unexpected page");
      reportedTotal = payload.meta.pagination.total;
      for (const agent of payload.data) {
        assert(agent.chain_id === chainId, "8004scan result crossed the requested chain boundary");
        assert(typeof agent.agent_id === "string" && agent.agent_id.startsWith(`${chainId}:`), "Invalid canonical agent ID");
        identities.set(agent.agent_id, agent);
      }
      pages += 1;
      if (!payload.meta.pagination.hasMore) break;
      page += 1;
    }
    assert(page <= 20, `Pagination safety limit exceeded for ${chainId}:${search}`);
    coverage.push({ chainId, search, pages, reportedTotal });
  }
}

assert(identities.size > 0, "No live marketplace identities were returned");
const siteUrl = new URL("/agents", SITE);
siteUrl.searchParams.set("q", "grid");
siteUrl.searchParams.set("category", "grid-trading");
siteUrl.searchParams.set("network", "mainnet");
siteUrl.searchParams.set("rail", "x402");
siteUrl.searchParams.set("sort", "name");
siteUrl.searchParams.set("perPage", "12");
const html = await (await get(siteUrl)).text();
assert(html.includes("Find the agent that fits the job"), "Marketplace heading is absent");
assert(html.includes("Search agents"), "English search control is absent");
assert(html.includes("Payment rail"), "Payment filter is absent");
assert(html.includes("GridMaster Ops"), "Live filtered grid agent is absent");

console.log(JSON.stringify({
  ok: true,
  checkedAt: new Date().toISOString(),
  site: SITE,
  uniqueLiveIdentities: identities.size,
  sourceQueries: coverage.length,
  sourcePages: coverage.reduce((sum, entry) => sum + entry.pages, 0),
  coverage,
}, null, 2));
