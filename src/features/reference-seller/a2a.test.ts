import { describe, expect, it } from "vitest";
import { privateKeyToAccount } from "viem/accounts";

import {
  createReferenceSellerCard,
  createReferenceSellerRegistration,
  handleA2aRequest,
} from "./a2a";

const account = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
const agentId = "97:0x8004a818bfb912233c491871b3d84c89a494bd9e:2000";

const task = {
  skill: "rebalancing",
  parameters: {
    poolAddress: "0x1111111111111111111111111111111111111111",
    rangeWidthBps: 1000,
  },
};

describe("reference seller A2A surface", () => {
  it("publishes an A2A 1.0 Agent Card with all four equal-depth skills", () => {
    const card = createReferenceSellerCard("https://castyard.example", agentId);
    expect(card.supportedInterfaces).toEqual([{
      url: "https://castyard.example/api/reference-seller/a2a",
      protocolBinding: "JSONRPC",
      protocolVersion: "1.0",
    }]);
    expect(card.skills.map((skill) => skill.id)).toEqual([
      "rebalancing",
      "grid-trading",
      "yield-optimisation",
      "health-factor-monitoring",
    ]);
    expect(card.defaultInputModes).toEqual(["application/json"]);
    expect(card.capabilities).toEqual({ streaming: false, pushNotifications: false, extendedAgentCard: false });
    expect(card.metadata.registrations).toEqual([{
      agentId: 2000,
      agentRegistry: "eip155:97:0x8004a818bfb912233c491871b3d84c89a494bd9e",
    }]);
  });

  it("publishes the ERC-8004 endpoint-domain verification document", () => {
    const registration = createReferenceSellerRegistration("https://castyard.example", agentId);
    expect(registration).toMatchObject({
      type: "https://eips.ethereum.org/EIPS/eip-8004#registration-v1",
      active: true,
      registrations: [{
        agentId: 2000,
        agentRegistry: "eip155:97:0x8004a818bfb912233c491871b3d84c89a494bd9e",
      }],
      services: [{
        name: "A2A",
        endpoint: "https://castyard.example/.well-known/agent-card.json",
        version: "1.0",
      }],
    });
  });

  it("returns a signed quote in a standard A2A data part", async () => {
    const response = await handleA2aRequest({
      jsonrpc: "2.0",
      id: "rpc-1",
      method: "SendMessage",
      params: {
        message: {
          messageId: "message-1",
          role: "ROLE_USER",
          parts: [{ data: { action: "quote", task } }],
        },
      },
    }, { account, agentId, now: () => 1_787_000_000, nonce: () => `0x${"12".repeat(32)}` });

    expect(response).toMatchObject({
      jsonrpc: "2.0",
      id: "rpc-1",
      result: {
        message: {
          role: "ROLE_AGENT",
          parts: [{ data: { action: "quote", quote: { agentId, amount: "10000000000000000" } } }],
        },
      },
    });
  });

  it.each([
    ["wrong method", { jsonrpc: "2.0", id: 1, method: "unknown", params: {} }, -32601],
    ["missing data part", { jsonrpc: "2.0", id: 2, method: "SendMessage", params: { message: { messageId: "m", role: "ROLE_USER", parts: [{ text: "quote" }] } } }, -32602],
    ["invalid task", { jsonrpc: "2.0", id: 3, method: "SendMessage", params: { message: { messageId: "m", role: "ROLE_USER", parts: [{ data: { action: "quote", task: { skill: "rebalancing", parameters: { poolAddress: "bad" } } } }] } } }, -32602],
  ])("returns a JSON-RPC error for %s", async (_label, request, code) => {
    const response = await handleA2aRequest(request, { account, agentId, now: () => 1_787_000_000, nonce: () => `0x${"12".repeat(32)}` });
    expect(response).toMatchObject({ jsonrpc: "2.0", error: { code } });
  });
});
