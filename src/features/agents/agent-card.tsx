import { EvidenceBadge } from "@/components/evidence-badge";
import { SourceStamp } from "@/components/source-stamp";
import type { AgentSummary } from "./domain";
import { formatAddress } from "./format";

export function AgentCard({ agent, now }: { agent: AgentSummary; now?: Date }) {
  const { identity } = agent;
  return (
    <article className="agent-card">
      <div className="agent-card-topline">
        <EvidenceBadge state={agent.evidenceState} />
        <span className="agent-token">Agent #{identity.erc8004AgentTokenId}</span>
      </div>
      <h3>{identity.name}</h3>
      <p className="agent-description">{identity.description || "No description published."}</p>
      <div className="agent-markers" aria-label="Published protocol markers">
        <span>{identity.isTestnet ? "BSC testnet" : "BSC mainnet"}</span>
        {identity.supportedProtocols.map((protocol) => <span key={protocol}>{protocol}</span>)}
        {agent.activationRails?.includes("erc8183") ? <span>ERC-8183 verified</span> : null}
        {identity.x402Supported ? <span>x402 marker</span> : null}
        <span>{identity.totalFeedbacks ?? 0} feedback</span>
      </div>
      <dl className="agent-identity-mini">
        <div><dt>Owner</dt><dd>{formatAddress(identity.ownerAddress)}</dd></div>
        <div><dt>Claim reason</dt><dd>{agent.categoryClaims.map((claim) => claim.matchedPhrase).join(", ")}</dd></div>
      </dl>
      <SourceStamp source={identity.source} now={now} />
      <a className="agent-passport-link" href={`/agents/${identity.agentId}`}>
        Inspect passport <span aria-hidden="true">↗</span>
      </a>
    </article>
  );
}
