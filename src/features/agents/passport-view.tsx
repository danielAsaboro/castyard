import { EvidenceBadge } from "@/components/evidence-badge";
import { Metric } from "@/components/metric";
import { SourceStamp } from "@/components/source-stamp";
import { UpstreamState } from "@/components/upstream-state";
import type { AgentPassport } from "./domain";
import { formatAddress, formatWindow } from "./format";

function PublishedValue({ value }: { value: string | number | boolean | undefined }) {
  if (value === undefined) return <span>Not published</span>;
  if (typeof value === "boolean") return <span>{value ? "Yes" : "No"}</span>;
  return <span>{value}</span>;
}

export function PassportView({ passport }: { passport: AgentPassport }) {
  const { identity, rebalancingEvidence: evidence } = passport;
  return (
    <div className="passport">
      <header className="passport-hero">
        <div>
          <p className="eyebrow">Agent Passport · BSC mainnet</p>
          <h1 className="section-title">{identity.name}</h1>
          <p className="lede">{identity.description || "No description published."}</p>
        </div>
        <div className="passport-status">
          <EvidenceBadge state={passport.evidenceState} />
          <SourceStamp source={identity.source} />
        </div>
      </header>

      <section className="passport-section paper-panel">
        <div className="passport-section-heading">
          <p className="eyebrow">01 · Identity</p>
          <h2>Registered facts</h2>
        </div>
        <dl className="fact-grid">
          <div><dt>ERC-8004 agent token</dt><dd>{identity.erc8004AgentTokenId}</dd></div>
          <div><dt>Chain</dt><dd>BNB Smart Chain · {identity.chainId}</dd></div>
          <div><dt>Owner</dt><dd>{formatAddress(identity.ownerAddress)}</dd></div>
          <div><dt>Registry</dt><dd>{formatAddress(identity.registryAddress)}</dd></div>
          <div><dt>Protocols published</dt><dd>{identity.supportedProtocols.join(", ") || "Not published"}</dd></div>
          <div><dt>x402 marker</dt><dd>{identity.x402Supported ? "Published" : "Not published"}</dd></div>
        </dl>
      </section>

      {evidence ? (
        <>
          {evidence.partialFailures.length > 0 ? <UpstreamState kind="partial" /> : null}
          <section className="passport-section paper-panel">
            <div className="passport-section-heading">
              <p className="eyebrow">02 · Live service</p>
              <h2>Observed operating state</h2>
              <SourceStamp source={evidence.source} revalidationSeconds={30} />
            </div>
            <dl className="fact-grid">
              <div><dt>Service version</dt><dd><PublishedValue value={evidence.serviceVersion} /></dd></div>
              <div><dt>Network</dt><dd><PublishedValue value={evidence.network} /></dd></div>
              <div><dt>Protocol</dt><dd><PublishedValue value={evidence.protocol} /></dd></div>
              <div><dt>Pair</dt><dd><PublishedValue value={evidence.pair} /></dd></div>
              <div><dt>Observed block</dt><dd><PublishedValue value={evidence.blockNumber} /></dd></div>
              <div><dt>Service wallet</dt><dd>{evidence.walletAddress ? formatAddress(evidence.walletAddress) : "Not published"}</dd></div>
            </dl>
          </section>

          <section className="passport-section paper-panel">
            <div className="passport-section-heading">
              <p className="eyebrow">03 · Managed position</p>
              <h2>PancakeSwap V3 range</h2>
            </div>
            <dl className="fact-grid">
              <div><dt>PancakeSwap position NFT</dt><dd>{evidence.pancakePositionNftId ?? "Not published"}</dd></div>
              <div><dt>In range</dt><dd><PublishedValue value={evidence.inRange} /></dd></div>
              <div><dt>Current price</dt><dd><PublishedValue value={evidence.currentPrice?.toFixed(2)} /></dd></div>
              <div><dt>Current range</dt><dd>{evidence.lowerPrice?.toFixed(2) ?? "—"}–{evidence.upperPrice?.toFixed(2) ?? "—"}</dd></div>
              <div><dt>Range width</dt><dd>{evidence.rangePercent === undefined ? "Not published" : `${evidence.rangePercent}%`}</dd></div>
              <div><dt>Slippage ceiling</dt><dd>{evidence.maxSlippagePercent === undefined ? "Not published" : `${evidence.maxSlippagePercent}%`}</dd></div>
            </dl>
          </section>

          <section className="passport-section paper-panel">
            <div className="passport-section-heading">
              <p className="eyebrow">04 · Performance</p>
              <h2>What the operator reports</h2>
            </div>
            <div className="metric-grid">
              <Metric label="Position value" evidence={evidence.tvl} style="currency" />
              <Metric label="Pending USDT fees" evidence={evidence.pendingFees} style="currency" />
              <Metric label="Gas cost" evidence={evidence.gasCost} style="currency" />
              <Metric label="Net P&L" evidence={evidence.pnl} style="currency" />
              <Metric label="Annualised fee APR" evidence={evidence.apr} style="percent" />
            </div>
            <div className="window-row">
              {evidence.pnl ? <span>P&L: <span>{formatWindow(evidence.pnl)}</span></span> : null}
              {evidence.apr ? <span>APR: <span>{formatWindow(evidence.apr)}</span></span> : null}
              <span>Rebalances observed: {evidence.rebalanceCount ?? "Not published"}</span>
            </div>
          </section>

          <section className="passport-section paper-panel">
            <div className="passport-section-heading">
              <p className="eyebrow">05 · Receipts</p>
              <h2>Transaction-linked history</h2>
            </div>
            <div className="receipt-list">
              {evidence.receipts.map((receipt, index) => (
                <a href={receipt.explorerUrl} target="_blank" rel="noopener noreferrer" key={receipt.hash}>
                  <span>Receipt 0{index + 1}</span>
                  <code>{receipt.hash.slice(0, 12)}…{receipt.hash.slice(-8)}</code>
                  <strong>View BscScan receipt ↗</strong>
                </a>
              ))}
            </div>
          </section>

          <section className="passport-section trust-boundary">
            <div>
              <p className="eyebrow">Trust boundary</p>
              <h2>Observed is not guaranteed.</h2>
            </div>
            <ul>
              <li>ERC-8004 identity and owner come from 8004scan.</li>
              <li>Operator-reported position and performance values are labelled as such.</li>
              <li>Transaction links are validated receipts, not proof of future performance.</li>
              <li>Published risk controls are claims until independently exercised.</li>
            </ul>
          </section>
        </>
      ) : (
        <UpstreamState kind="empty" />
      )}

      <section className="activation-boundary paper-panel">
        <p className="eyebrow">Activation boundary</p>
        <h2>Read-only evidence available; hiring and execution are not yet qualified in Castyard.</h2>
        <p>
          The service publishes write operations, but Castyard will not expose them until the
          ERC-8183 commerce path, bounded authority, and durable execution receipts are verified.
        </p>
      </section>
    </div>
  );
}
