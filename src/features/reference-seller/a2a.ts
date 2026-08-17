import type { Hex } from "viem";
import type { PrivateKeyAccount } from "viem/accounts";

import { createSignedQuote } from "@/features/activation/quote";

const skillDefinitions = [
  {
    id: "rebalancing",
    name: "LP rebalancing analysis",
    description: "Reads a BSC PancakeSwap V3 pool and produces a bounded liquidity-range rebalancing analysis with block-level provenance.",
    tags: ["bsc", "pancakeswap", "liquidity", "rebalancing"],
  },
  {
    id: "grid-trading",
    name: "Grid trading analysis",
    description: "Reads a BSC PancakeSwap V3 pool and evaluates a caller-supplied price grid without placing trades or risking funds.",
    tags: ["bsc", "pancakeswap", "grid", "trading"],
  },
  {
    id: "yield-optimisation",
    name: "Yield market comparison",
    description: "Reads caller-selected Venus markets and compares current onchain supply conditions with explicit assumptions.",
    tags: ["bsc", "venus", "yield", "lending"],
  },
  {
    id: "health-factor-monitoring",
    name: "Account liquidity health check",
    description: "Reads a Venus-compatible comptroller and reports current account liquidity or shortfall with block-level provenance.",
    tags: ["bsc", "venus", "risk", "health-factor"],
  },
] as const;

const registrationType = "https://eips.ethereum.org/EIPS/eip-8004#registration-v1";

function parseAgentRegistration(agentId: string) {
  const match = /^(\d+):(0x[0-9a-fA-F]{40}):(\d+)$/.exec(agentId);
  if (!match) throw new Error("Invalid ERC-8004 agent identifier");
  const [, chainId, identityRegistry, tokenId] = match;
  return {
    agentId: Number(tokenId),
    agentRegistry: `eip155:${chainId}:${identityRegistry.toLowerCase()}`,
  };
}

export function createReferenceSellerCard(baseUrl: string, agentId?: string) {
  const origin = new URL(baseUrl).origin;
  const registrations = agentId ? [parseAgentRegistration(agentId)] : [];
  return {
    name: "Castyard Reference Seller",
    description: "A standards-based ERC-8004 seller for four read-only BSC DeFi analysis skills. Quotes are signed and execution is gated by funded ERC-8183 jobs.",
    supportedInterfaces: [{
      url: `${origin}/api/reference-seller/a2a`,
      protocolBinding: "JSONRPC",
      protocolVersion: "1.0",
    }],
    provider: { organization: "Castyard", url: origin },
    version: "0.1.0",
    documentationUrl: `${origin}/evidence`,
    capabilities: { streaming: false, pushNotifications: false, extendedAgentCard: false },
    defaultInputModes: ["application/json"],
    defaultOutputModes: ["application/json"],
    skills: skillDefinitions,
    metadata: {
      ...(agentId ? { erc8004AgentId: agentId } : {}),
      registrations,
      executionProtocol: "ERC-8183",
      chainId: 97,
      jobStatusUrlTemplate: `${origin}/api/reference-seller/jobs/{jobId}`,
    },
  };
}

export function createReferenceSellerRegistration(baseUrl: string, agentId: string) {
  const origin = new URL(baseUrl).origin;
  return {
    type: registrationType,
    name: "Castyard Reference Seller",
    description: "A standards-based ERC-8004 seller for four read-only BSC DeFi analysis skills, activated through funded ERC-8183 jobs.",
    image: "",
    services: [{
      name: "A2A",
      endpoint: `${origin}/.well-known/agent-card.json`,
      version: "1.0",
    }],
    x402Support: false,
    active: true,
    registrations: [parseAgentRegistration(agentId)],
    supportedTrust: ["reputation", "crypto-economic"],
  };
}

type Dependencies = {
  account: PrivateKeyAccount;
  agentId: string;
  now?: () => number;
  nonce?: () => Hex;
};

type JsonRpcId = string | number | null;

function rpcError(id: JsonRpcId, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } } as const;
}

function object(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

export async function handleA2aRequest(request: unknown, dependencies: Dependencies) {
  const body = object(request);
  const id = body && (typeof body.id === "string" || typeof body.id === "number" || body.id === null) ? body.id : null;
  if (!body || body.jsonrpc !== "2.0") return rpcError(id, -32600, "Invalid Request");
  if (body.method !== "SendMessage" && body.method !== "message/send") return rpcError(id, -32601, "Method not found");

  try {
    const params = object(body.params);
    const message = object(params?.message);
    const parts = Array.isArray(message?.parts) ? message.parts : [];
    const data = parts.map(object).map((part) => object(part?.data)).find((part) => part?.action === "quote");
    if (!message || typeof message.messageId !== "string" || message.role !== "ROLE_USER" || !data) {
      return rpcError(id, -32602, "A quote request must be supplied in one application/json data part");
    }

    const now = dependencies.now?.() ?? Math.floor(Date.now() / 1000);
    const nonce = dependencies.nonce?.() ?? `0x${Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
    const quote = await createSignedQuote({
      account: dependencies.account,
      agentId: dependencies.agentId,
      task: data.task,
      amount: 10_000n,
      now,
      ttlSeconds: 600,
      nonce,
    });

    return {
      jsonrpc: "2.0",
      id,
      result: {
        message: {
          messageId: crypto.randomUUID(),
          contextId: message.contextId ?? crypto.randomUUID(),
          role: "ROLE_AGENT",
          parts: [{ data: { action: "quote", quote } }],
        },
      },
    } as const;
  } catch (error) {
    return rpcError(id, -32602, error instanceof Error ? error.message : "Invalid params");
  }
}
