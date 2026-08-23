import type { AgentPassport } from "./domain";
import { qualifyAgent } from "./qualify";
import { fetchBnbLpRebalancerEvidence } from "./sources/bnb-lp-rebalancer";
import { fetchBscAgents } from "./sources/8004scan";

export const REBALANCER_AGENT_ID =
  "56:0x8004a169fb4a3325136eb29fa0ceb6d2e539a432:265375";

export class AgentPassportNotFoundError extends Error {
  constructor(agentId: string) {
    super(`Live ERC-8004 identity not found: ${agentId}`);
    this.name = "AgentPassportNotFoundError";
  }
}

export async function loadAgentPassport(
  agentId: string,
  fetcher: typeof fetch = fetch,
): Promise<AgentPassport> {
  // 8004scan's public search matches token IDs but does not match the canonical
  // chain:registry:token composite. We still require an exact composite match
  // after retrieval so a token-ID collision cannot select another identity.
  const parts = agentId.split(":");
  const chainId = parts[0] === "56" ? 56 : parts[0] === "97" ? 97 : undefined;
  if (!chainId) throw new AgentPassportNotFoundError(agentId);
  const tokenId = parts.at(-1) ?? agentId;
  const result = await fetchBscAgents({ chainId, search: tokenId, limit: 10, fetcher });
  const identity = result.agents.find((agent) => agent.agentId === agentId);
  if (!identity) {
    throw new AgentPassportNotFoundError(agentId);
  }

  if (agentId !== REBALANCER_AGENT_ID) {
    return qualifyAgent(identity);
  }

  const rebalancingEvidence = await fetchBnbLpRebalancerEvidence(identity, fetcher);
  return {
    ...qualifyAgent(identity, rebalancingEvidence),
    rebalancingEvidence,
  };
}
