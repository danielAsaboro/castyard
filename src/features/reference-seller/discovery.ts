import type { AgentCategory, AgentIdentity, AgentSummary, CategoryClaim } from "@/features/agents/domain";
import { qualifyAgent } from "@/features/agents/qualify";
import { REFERENCE_SELLER_AGENT_ID } from "@/features/activation/contracts";

const requiredSkills: { id: AgentCategory; label: string }[] = [
  { id: "rebalancing", label: "LP rebalancing analysis" },
  { id: "grid-trading", label: "Grid trading analysis" },
  { id: "yield-optimisation", label: "Yield market comparison" },
  { id: "health-factor-monitoring", label: "Account liquidity health check" },
];

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} is invalid`);
  return value as Record<string, unknown>;
}

export function summarizeReferenceSeller(identity: AgentIdentity, cardValue: unknown, expectedOrigin: string): AgentSummary {
  if (identity.agentId !== REFERENCE_SELLER_AGENT_ID || identity.chainId !== 97) {
    throw new Error("Reference seller identity does not match the registered BSC testnet agent");
  }
  const origin = new URL(expectedOrigin).origin;
  const card = record(cardValue, "AgentCard");
  const metadata = record(card.metadata, "AgentCard metadata");
  if (metadata.erc8004AgentId !== identity.agentId || metadata.executionProtocol !== "ERC-8183" || metadata.chainId !== 97) {
    throw new Error("AgentCard registration or execution protocol does not match the seller identity");
  }
  if (!Array.isArray(card.supportedInterfaces)) throw new Error("AgentCard interfaces are missing");
  const hasA2a = card.supportedInterfaces.some((value) => {
    const entry = record(value, "AgentCard interface");
    return entry.url === `${origin}/api/reference-seller/a2a`
      && entry.protocolBinding === "JSONRPC"
      && entry.protocolVersion === "1.0";
  });
  if (!hasA2a) throw new Error("AgentCard A2A interface does not match the registered origin");
  if (!Array.isArray(card.skills)) throw new Error("AgentCard skills are missing");
  const skillIds = new Set(card.skills.map((value) => record(value, "AgentCard skill").id));
  if (!requiredSkills.every(({ id }) => skillIds.has(id))) throw new Error("AgentCard does not publish all four marketplace skills");

  const categoryClaims: CategoryClaim[] = requiredSkills.map(({ id, label }) => ({
    category: id,
    matchedPhrase: `AgentCard · ${label}`,
  }));
  return {
    ...qualifyAgent(identity),
    categoryClaims,
    evidenceState: "claimed",
    activationRails: ["erc8183"],
  };
}

export async function fetchReferenceSellerSummary(
  identity: AgentIdentity,
  fetcher: typeof fetch,
  origin: string,
): Promise<AgentSummary> {
  const response = await fetcher(`${new URL(origin).origin}/.well-known/agent-card.json`, {
    method: "GET",
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(8_000),
    next: { revalidate: 60 },
  } as RequestInit & { next: { revalidate: number } });
  if (!response.ok) throw new Error(`Reference seller AgentCard returned HTTP ${response.status}`);
  return summarizeReferenceSeller(identity, await response.json(), origin);
}
