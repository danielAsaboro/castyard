import { describe, expect, it } from "vitest";

import { normalize8004Agent } from "@/features/agents/sources/8004scan";
import capturedTestnetAgent from "@/features/agents/sources/fixtures/8004scan-mefai-testnet.json";
import { REFERENCE_SELLER_AGENT_ID } from "@/features/activation/contracts";
import { summarizeReferenceSeller } from "./discovery";

const identity = normalize8004Agent({
  ...capturedTestnetAgent,
  agent_id: REFERENCE_SELLER_AGENT_ID,
  token_id: "1830",
  owner_address: "0x74258A428e94294F14a8c8308CE21259223A0187",
  name: "Castyard Reference Seller",
  description: "A standards-based ERC-8004 seller for four read-only BSC DeFi analysis skills.",
});

const card = {
  name: "Castyard Reference Seller",
  supportedInterfaces: [{
    url: "https://castyard-agents.asaborodaniel.chatgpt.site/api/reference-seller/a2a",
    protocolBinding: "JSONRPC",
    protocolVersion: "1.0",
  }],
  skills: [
    { id: "rebalancing", name: "LP rebalancing analysis" },
    { id: "grid-trading", name: "Grid trading analysis" },
    { id: "yield-optimisation", name: "Yield market comparison" },
    { id: "health-factor-monitoring", name: "Account liquidity health check" },
  ],
  metadata: {
    erc8004AgentId: REFERENCE_SELLER_AGENT_ID,
    executionProtocol: "ERC-8183",
    chainId: 97,
  },
};

const registration = {
  type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
  name: "Castyard Reference Seller",
  x402Support: false,
  active: true,
  services: [{ name: "A2A", endpoint: "https://castyard-agents.asaborodaniel.chatgpt.site/.well-known/agent-card.json", version: "1.0" }],
  registrations: [{ agentId: 1830, agentRegistry: "eip155:97:0x8004a818bfb912233c491871b3d84c89a494bd9e" }],
};

describe("reference seller marketplace discovery", () => {
  it("derives all four category claims and the commerce rail from its verified live AgentCard", () => {
    const summary = summarizeReferenceSeller(identity, card, registration, "https://castyard-agents.asaborodaniel.chatgpt.site");

    expect(summary.categoryClaims.map(({ category }) => category)).toEqual([
      "rebalancing",
      "grid-trading",
      "yield-optimisation",
      "health-factor-monitoring",
    ]);
    expect(summary.activationRails).toEqual(["erc8183"]);
    expect(summary.evidenceState).toBe("claimed");
    expect(summary.identity.x402Supported).toBe(false);
  });

  it.each([
    ["another agent", { ...card, metadata: { ...card.metadata, erc8004AgentId: "97:0x8004a818bfb912233c491871b3d84c89a494bd9e:999" } }],
    ["another endpoint", { ...card, supportedInterfaces: [{ ...card.supportedInterfaces[0], url: "https://evil.example/a2a" }] }],
    ["missing skill", { ...card, skills: card.skills.slice(0, 3) }],
  ])("rejects %s", (_label, invalidCard) => {
    expect(() => summarizeReferenceSeller(identity, invalidCard, registration, "https://castyard-agents.asaborodaniel.chatgpt.site")).toThrow();
  });

  it("rejects an endpoint-domain registration that does not bind the live AgentCard", () => {
    const invalid = { ...registration, services: [{ ...registration.services[0], endpoint: "https://evil.example/card.json" }] };
    expect(() => summarizeReferenceSeller(identity, card, invalid, "https://castyard-agents.asaborodaniel.chatgpt.site")).toThrow();
  });
});
