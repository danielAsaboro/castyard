import { describe, expect, it } from "vitest";

import capturedResponse from "./fixtures/8004scan-rebalancer.json";
import { fetchBscAgents, normalize8004Agent, UpstreamError } from "./8004scan";

describe("8004scan source", () => {
  it("normalizes a captured live BSC agent record", () => {
    const agent = normalize8004Agent(capturedResponse.data[0]);

    expect(agent.erc8004AgentTokenId).toBe("265375");
    expect(agent.chainId).toBe(56);
    expect(agent.ownerAddress).toBe("0x20f1ca5d1e5a3ee94c29dbf95e6bf6cea6a8d64b");
    expect(agent.supportedProtocols).toEqual(["A2A"]);
    expect(agent.x402Supported).toBe(true);
  });

  it("uses the documented camelCase BSC filter and clamps anonymous limits", async () => {
    let requestedUrl: URL | undefined;
    const fetcher: typeof fetch = async (input) => {
      requestedUrl = new URL(String(input));
      return new Response(JSON.stringify(capturedResponse), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };

    const result = await fetchBscAgents({ search: "rebalancing", limit: 50, fetcher });

    expect(requestedUrl?.searchParams.get("chainId")).toBe("56");
    expect(requestedUrl?.searchParams.has("chain_id")).toBe(false);
    expect(requestedUrl?.searchParams.get("limit")).toBe("10");
    expect(result.agents).toHaveLength(1);
    expect(result.source.requestId).toBe("iYBxOhjt4J9ELQfG3qbLN");
  });

  it.each([
    ["missing agent id", { ...capturedResponse.data[0], agent_id: undefined }],
    ["wrong chain", { ...capturedResponse.data[0], chain_id: 1 }],
    ["malformed owner", { ...capturedResponse.data[0], owner_address: "not-an-address" }],
  ])("rejects %s", (_label, record) => {
    expect(() => normalize8004Agent(record)).toThrow(UpstreamError);
  });

  it("preserves rate-limit recovery information", async () => {
    const fetcher: typeof fetch = async () =>
      new Response("rate limited", {
        status: 429,
        headers: { "retry-after": "60" },
      });

    await expect(fetchBscAgents({ fetcher })).rejects.toMatchObject({
      kind: "rate-limit",
      status: 429,
      retryAfter: "60",
    });
  });

  it("rejects an invalid upstream envelope", async () => {
    const fetcher: typeof fetch = async () =>
      new Response(JSON.stringify({ success: true, data: "not-an-array" }), { status: 200 });

    await expect(fetchBscAgents({ fetcher })).rejects.toMatchObject({ kind: "schema" });
  });
});
