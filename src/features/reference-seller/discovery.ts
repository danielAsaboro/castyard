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

export function summarizeReferenceSeller(
  identity: AgentIdentity,
  cardValue: unknown,
  registrationValue: unknown,
  expectedOrigin: string,
): AgentSummary {
  if (identity.agentId !== REFERENCE_SELLER_AGENT_ID || identity.chainId !== 97) {
    throw new Error("Reference seller identity does not match the registered BSC testnet agent");
  }
  const origin = new URL(expectedOrigin).origin;
  const card = record(cardValue, "AgentCard");
  const registration = record(registrationValue, "endpoint registration");
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

  if (registration.active !== true || registration.x402Support !== false || !Array.isArray(registration.registrations)) {
    throw new Error("Endpoint registration has an invalid activation state");
  }
  const registryTuple = `eip155:97:${identity.registryAddress}`.toLowerCase();
  const hasRegistration = registration.registrations.some((value) => {
    const entry = record(value, "endpoint registration tuple");
    return entry.agentId === Number(identity.erc8004AgentTokenId)
      && typeof entry.agentRegistry === "string"
      && entry.agentRegistry.toLowerCase() === registryTuple;
  });
  if (!hasRegistration || !Array.isArray(registration.services)) throw new Error("Endpoint registration does not match the ERC-8004 identity");
  const hasCardService = registration.services.some((value) => {
    const service = record(value, "endpoint registration service");
    return service.name === "A2A"
      && service.version === "1.0"
      && service.endpoint === `${origin}/.well-known/agent-card.json`;
  });
  if (!hasCardService) throw new Error("Endpoint registration does not bind the live AgentCard");

  const categoryClaims: CategoryClaim[] = requiredSkills.map(({ id, label }) => ({
    category: id,
    matchedPhrase: `AgentCard · ${label}`,
  }));
  return {
    ...qualifyAgent({ ...identity, x402Supported: false }),
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
  const sellerOrigin = new URL(origin).origin;
  const fetchDocument = async (path: string, label: string) => {
    const response = await fetcher(`${sellerOrigin}${path}`, {
      method: "GET",
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(8_000),
      next: { revalidate: 60 },
    } as RequestInit & { next: { revalidate: number } });
    if (!response.ok) throw new Error(`Reference seller ${label} returned HTTP ${response.status}`);
    return response.json();
  };
  const [card, registration] = await Promise.all([
    fetchDocument("/.well-known/agent-card.json", "AgentCard"),
    fetchDocument("/.well-known/agent-registration.json", "endpoint registration"),
  ]);
  return summarizeReferenceSeller(identity, card, registration, sellerOrigin);
}
