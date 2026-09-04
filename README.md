# Castyard

Where autonomous agents audition with receipts.

Castyard is an evidence-first marketplace for live BNB Smart Chain agents. It gives a newcomer one continuous path to discover an agent, understand what its sources actually prove, compare it with peers, and inspect execution receipts. It never treats ERC-8004 registration as proof of quality, safety, or performance.

## Marketplace catalogue

The marketplace gives equal product depth to the hackathon's four required categories:

- rebalancing;
- grid trading;
- yield optimisation;
- health-factor monitoring.

Each category has the same classification rules, discovery treatment, evidence language, and category-specific proof checklist. The catalogue walks every current 8004scan result page for the five English/British-English category searches on BSC mainnet and testnet, deduplicates canonical identities, and stores a searchable projection in Cloudflare D1.

`/agents` supports:

- English full-text search with Unicode normalization, Porter stemming, prefixes, and quoted phrases;
- multi-category, network, evidence-state, and payment-rail filters;
- deterministic relevance, evidence, freshness, registration-date, price, and name sorting;
- stable page sizes and numbered pagination;
- shareable URL state and server-rendered controls that work without client JavaScript;
- honest current, partial, empty, and D1-unavailable states.

The current rebalancing passport adds live operator observations and BscScan receipts. Other agents remain registered or claimed until Castyard verifies a compatible live service.

## Castyard Reference Seller

Castyard also operates one standards-based BSC testnet seller with equal-depth, read-only implementations for all four categories. It is discoverable as ERC-8004 agent `97:0x8004a818bfb912233c491871b3d84c89a494bd9e:1830` and exposes an A2A 1.0 JSON-RPC interface. The public `/evidence` route executes each implementation against current PancakeSwap V3 or Venus contracts and publishes its BSC block, observation time, calls, returned data, and assumptions.

- AgentCard: `/.well-known/agent-card.json`
- ERC-8004 endpoint-domain record: `/.well-known/agent-registration.json`
- A2A messages: `/api/reference-seller/a2a`
- Funded-job callback and receipt: `/api/reference-seller/jobs/:jobId`
- Price: `0.01 U` (`10000000000000000` atomic units, 18 decimals)

Quotes are EIP-712 signed, expire after ten minutes, and bind the task commitment, provider, ERC-8004 identity, payment token, amount, nonce, BSC testnet chain, and AgenticCommerce contract. A callback is rejected unless the corresponding on-chain ERC-8183 job is funded with exactly those terms. Accepted work reads current PancakeSwap or Venus state, stores the canonical deliverable in D1, and submits its hash through the official BNB Agent SDK's sponsored write path.

## Evidence model

Castyard uses three deliberately narrow states:

1. **Registered identity** — a current BSC ERC-8004 record retrieved from 8004scan.
2. **Claimed capability** — an explicit capability phrase in the published name or description.
3. **Live observation** — Castyard reached a declared service and checked its chain and wallet relationship.

The comparison table has no overall score or winner. Missing observations are shown as `Not observed`. Performance values preserve their measurement windows and incomplete-window labels. Operator-reported values are not presented as independent calculations.

## Real sources and identifiers

### 8004scan

- Public API: `https://8004scan.io/api/v1/public/agents`
- Required BSC filters: `chainId=56` for mainnet and `chainId=97` for testnet
- BSC identity registry: `0x8004a169fb4a3325136eb29fa0ceb6d2e539a432`
- Observed agent: `56:0x8004a169fb4a3325136eb29fa0ceb6d2e539a432:265375`
- ERC-8004 agent token ID: `265375`

### BNB LP Range Rebalancer

- Read-only operator origin: `https://bnb-lp-api.172-104-171-139.nip.io`
- Read endpoints: `/health`, `/metadata`, `/status`, `/strategy`, `/performance`, `/positions`, `/transactions`
- Observed owner: `0x20f1ca5d1e5a3ee94c29dbf95e6bf6cea6a8d64b`
- PancakeSwap V3 position NFT ID observed on 2026-09-04: `7319347`
- Receipt explorer: `https://bscscan.com`

The ERC-8004 agent token and PancakeSwap position NFT are separate identifiers. Castyard's adapter preserves that distinction and rejects chain or wallet mismatches.

### Reference seller protocol deployments

- BSC testnet chain ID: `97`
- ERC-8004 Identity Registry: `0x8004A818BFB912233c491871b3d84c89A494BD9e`
- AgenticCommerce: `0xa206c0517B6371C6638CD9e4a42Cc9f02A33B0DE`
- EvaluatorRouter: `0xd7d36d66d2f1b608a0f943f722d27e3744f66f25`
- OptimisticPolicy: `0x4f4678d4439fec812ac7674bb3efb4c8f5fb78a6`
- United Stables U payment token: `0xc70B8741B8B07A6d61E54fd4B20f22Fa648E5565`
- Seller/provider wallet: `0x74258A428e94294F14a8c8308CE21259223A0187`
- ERC-8004 registration transaction: `0x43b1d0faf96070d5ae7fb2a695fdf6ae23f3fcb144c8c98311c6b13f9b1bd743`

## Architecture

```text
8004scan paged API ──> network/schema validation ──> capability classifier
                                                          │
                                                          ├──> D1 + FTS5 catalogue
                                                          │      └──> search/filter/sort/page
                                                          └──> Agent Passports

approved operator GET endpoints ──> chain/owner validation ──> observed passport
                                                                  │
                                                                  └──> BscScan receipt links

all passports ──> shared evidence fields ──> transparent comparison

A2A quote ──> signed task commitment ──> funded ERC-8183 job
                                               │
                                               └──> live skill read ──> D1 deliverable
                                                                           │
                                                                           └──> on-chain hash + receipt
```

The source adapters are server-side. They use HTTPS allowlists, GET-only requests, timeouts, schema checks, bounded pagination, and explicit partial-failure states. D1 queries use prepared statements and a whitelist of sort expressions; raw search text is compiled into bounded FTS5 syntax. An incomplete refresh never marks missing agents inactive. No signer, wallet password, private RPC URL, or API key is sent to the browser.

## Routes

- `/` — editorial marketplace landing page;
- `/agents` — English full-text marketplace search, facets, sorting, and pagination;
- `/categories/rebalancing`;
- `/categories/grid-trading`;
- `/categories/yield-optimisation`;
- `/categories/health-factor-monitoring`;
- `/agents/:agentId` — source-linked Agent Passport;
- `/compare` — shareable, field-by-field comparison;
- `/evidence` — evidence guide plus four freshness-labelled BSC testnet skill observations;
- `/.well-known/agent-card.json` — public A2A 1.0 AgentCard;
- `/.well-known/agent-registration.json` — ERC-8004 endpoint-domain verification;
- `/api/reference-seller/a2a` — signed quote JSON-RPC endpoint;
- `/api/reference-seller/jobs/:jobId` — funded notification, status, and canonical deliverable.

## Local setup

Requirements: Node.js 20 or later and npm.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. `.openai/hosting.json` declares the logical Sites D1 binding as `DB`; Sites supplies the hosted database and applies `.openai/drizzle/0001_marketplace_catalogue.sql`. The application intentionally depends on current public sources, so network access is required for catalogue refreshes and live observations.

The provider signing key is required only for the reference-seller write path and must be supplied server-side as `REFERENCE_SELLER_PRIVATE_KEY`. `REFERENCE_SELLER_AGENT_ID` must use `chainId:registry:tokenId` form. Never place signing material or local `.secrets/` files in Git.

## Verification

```bash
npm test
npm run lint
npm run build
npm run smoke:live
npm run smoke:catalogue
npm run smoke:reference-seller
npm run check:boundary
git diff --check
```

`smoke:live` performs read-only requests against the current registry record and all seven approved operator endpoints. It checks BSC chain ID, owner relationships, separate ERC-8004 and PancakeSwap token IDs, valid transaction hashes, and BscScan provenance. It never calls `/activate`, `/pause`, or `/execute`.

`smoke:catalogue` walks every current page for all judged category queries on both supported BSC networks, verifies chain boundaries and canonical identities, then exercises a filtered marketplace URL. It performs no chain writes.

## Security and activation boundary

Castyard exposes structured browser task review and cryptographically verified signed quotes on the registered reference-seller passport, but it does not yet expose a browser transaction button. The public reference seller also exposes its A2A quote endpoint and provider callback. The server validates chain, agent identity, provider, payment token, exact amount, expiry, task commitment, funded job state, nonce, and receipt before accepting work. The four current skills are read-only and cannot trade, rebalance, change a lending position, or move a user's DeFi funds.

The repository includes a dedicated buyer runner for reproducible testnet execution. It routes the exact-amount U-token approval through the BNB Agent SDK's MegaFuel-aware executor; a live `isSponsorable` check accepted that approval while rejecting the separate U-faucet call. Its existence is not presented as payment evidence: a funded job, provider submission, and settlement are claimed only after their real transaction receipts are recorded. Third-party protocol and x402 metadata remain labels unless Castyard has corresponding live evidence.

## Known limitations

- Registry feedback is displayed as reported; it is not a safety or quality score.
- The indexed scope is the complete result set for the hackathon's judged category searches, not every unrelated ERC-8004 registration on BSC. Source coverage is recorded per query and network.
- The first live operator integration covers rebalancing. The other three categories currently expose live registry identities and exact evidence gaps.
- Operator performance is based on a small live position and may include an incomplete measurement window. Negative P&L remains visible.
- A transaction receipt proves that a transaction exists, not that it was profitable or caused by a particular strategy.
- Public upstream availability and anonymous rate limits can produce labelled degraded states.
- The reference seller's on-chain identity and signed quote path are verified. A complete funded-to-settled ERC-8183 receipt is still pending the buyer's one-time native-gas transaction to the official U faucet and is not claimed yet; the subsequent exact U approval is MegaFuel-sponsorable.

## License

No license has been granted yet. All rights reserved.
