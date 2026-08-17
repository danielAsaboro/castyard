# Castyard

Where autonomous agents audition with receipts.

Castyard is an evidence-first marketplace for live BNB Smart Chain agents. It gives a newcomer one continuous path to discover an agent, understand what its sources actually prove, compare it with peers, and inspect execution receipts. It never treats ERC-8004 registration as proof of quality, safety, or performance.

## First batch

The marketplace gives equal product depth to the hackathon's four required categories:

- rebalancing;
- grid trading;
- yield optimisation;
- health-factor monitoring.

Each category has the same classification rules, discovery treatment, evidence language, and category-specific proof checklist. The current rebalancing passport adds live operator observations and BscScan receipts. Other agents remain at registered or claimed evidence until Castyard can verify a compatible live service.

## Evidence model

Castyard uses three deliberately narrow states:

1. **Registered identity** — a current BSC ERC-8004 record retrieved from 8004scan.
2. **Claimed capability** — an explicit capability phrase in the published name or description.
3. **Live observation** — Castyard reached a declared service and checked its chain and wallet relationship.

The comparison table has no overall score or winner. Missing observations are shown as `Not observed`. Performance values preserve their measurement windows and incomplete-window labels. Operator-reported values are not presented as independent calculations.

## Real sources and identifiers

### 8004scan

- Public API: `https://8004scan.io/api/v1/public/agents`
- Required BSC filter: `chainId=56`
- BSC identity registry: `0x8004a169fb4a3325136eb29fa0ceb6d2e539a432`
- Observed agent: `56:0x8004a169fb4a3325136eb29fa0ceb6d2e539a432:265375`
- ERC-8004 agent token ID: `265375`

### BNB LP Range Rebalancer

- Read-only operator origin: `https://bnb-lp-api.172-104-171-139.nip.io`
- Read endpoints: `/health`, `/metadata`, `/status`, `/strategy`, `/performance`, `/positions`, `/transactions`
- Observed owner: `0x20f1ca5d1e5a3ee94c29dbf95e6bf6cea6a8d64b`
- PancakeSwap V3 position NFT ID: `7116214`
- Receipt explorer: `https://bscscan.com`

The ERC-8004 agent token and PancakeSwap position NFT are separate identifiers. Castyard's adapter preserves that distinction and rejects chain or wallet mismatches.

## Architecture

```text
8004scan public API ──> schema validation ──> capability classifier
                                                    │
                                                    ├──> discovery + category pages
                                                    └──> registered/claimed passports

approved operator GET endpoints ──> chain/owner validation ──> observed passport
                                                                  │
                                                                  └──> BscScan receipt links

all passports ──> shared evidence fields ──> transparent comparison
```

The source adapters are server-side. They use HTTPS allowlists, GET-only requests, timeouts, schema checks, anonymous 8004scan limits, and explicit partial-failure states. No signer, wallet password, private RPC URL, or API key is sent to the browser.

## Routes

- `/` — editorial marketplace landing page;
- `/agents` — live BSC discovery with server-side filters;
- `/categories/rebalancing`;
- `/categories/grid-trading`;
- `/categories/yield-optimisation`;
- `/categories/health-factor-monitoring`;
- `/agents/:agentId` — source-linked Agent Passport;
- `/compare` — shareable, field-by-field comparison;
- `/evidence` — evidence and provenance guide.

## Local setup

Requirements: Node.js 20 or later and npm.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. The application intentionally depends on current public sources, so network access is required for live discovery and observations.

## Verification

```bash
npm test
npm run lint
npm run build
npm run smoke:live
npm run check:boundary
git diff --check
```

`smoke:live` performs read-only requests against the current registry record and all seven approved operator endpoints. It checks BSC chain ID, owner relationships, separate ERC-8004 and PancakeSwap token IDs, valid transaction hashes, and BscScan provenance. It never calls `/activate`, `/pause`, or `/execute`.

## Security and activation boundary

Castyard does not currently expose activation or transaction buttons. The observed operator advertises write endpoints, but those paths have not been integrated into a verified permissioned payment flow. They remain unreachable from the production adapter and UI.

Before activation can ship, Castyard must validate chain, agent identity, endpoint, amount, slippage, expiry, spend cap, permission scope, payment receipt, and transaction receipt end to end. Until then, protocol and x402 metadata are labels—not proof that a payment or autonomous execution succeeded.

## Known limitations

- Registry feedback is displayed as reported; it is not a safety or quality score.
- The first live operator integration covers rebalancing. The other three categories currently expose live registry identities and exact evidence gaps.
- Operator performance is based on a small live position and may include an incomplete measurement window. Negative P&L remains visible.
- A transaction receipt proves that a transaction exists, not that it was profitable or caused by a particular strategy.
- Public upstream availability and anonymous rate limits can produce labelled degraded states.

## License

No license has been granted yet. All rights reserved.
