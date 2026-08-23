import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { privateKeyToAccount } from "viem/accounts";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createSignedQuote } from "./quote";
import { ActivationPanel } from "./activation-panel";

const account = privateKeyToAccount(`0x${"11".repeat(32)}`);
const agentId = "97:0x8004a818bfb912233c491871b3d84c89a494bd9e:1830";
const poolAddress = "0x1111111111111111111111111111111111111111";

afterEach(() => vi.unstubAllGlobals());

async function signedQuote() {
  return createSignedQuote({
    account,
    agentId,
    task: { skill: "rebalancing", parameters: { poolAddress, rangeWidthBps: 500 } },
    amount: 10_000_000_000_000_000n,
    now: Math.floor(Date.now() / 1000),
    ttlSeconds: 600,
    nonce: `0x${"22".repeat(32)}`,
  });
}

describe("reference seller activation panel", () => {
  it("keeps all four marketplace skills available as structured tasks", () => {
    render(<ActivationPanel agentId={agentId} expectedProvider={account.address} />);

    const skill = screen.getByLabelText("Analysis skill");
    expect(screen.getByRole("option", { name: "Rebalancing" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Grid trading" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Yield optimisation" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Health-factor monitoring" })).toBeInTheDocument();

    fireEvent.change(skill, { target: { value: "health-factor-monitoring" } });
    expect(screen.getByLabelText("Comptroller address")).toBeRequired();
    expect(screen.getByLabelText("Account to inspect")).toBeRequired();
  });

  it("requests and independently verifies a signed quote before showing payment terms", async () => {
    const quote = await signedQuote();
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      jsonrpc: "2.0",
      id: "castyard-quote",
      result: { message: { parts: [{ data: { action: "quote", quote } }] } },
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetcher);

    render(<ActivationPanel agentId={agentId} expectedProvider={account.address} />);
    fireEvent.change(screen.getByLabelText("PancakeSwap V3 pool"), { target: { value: poolAddress } });
    fireEvent.change(screen.getByLabelText("Target range width (bps)"), { target: { value: "500" } });
    fireEvent.click(screen.getByRole("button", { name: "Get signed quote" }));

    await waitFor(() => expect(screen.getByText("Signature verified")).toBeInTheDocument());
    expect(screen.getByText("0.01 U")).toBeInTheDocument();
    expect(screen.getByText(quote.taskCommitment)).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledWith("/api/reference-seller/a2a", expect.objectContaining({ method: "POST" }));

    const request = JSON.parse(String((fetcher.mock.calls[0]?.[1] as RequestInit).body));
    expect(request.params.message.parts[0].data).toEqual({
      action: "quote",
      task: { skill: "rebalancing", parameters: { poolAddress, rangeWidthBps: 500 } },
    });
  });

  it("rejects a quote signed by a provider other than the registered owner", async () => {
    const quote = await signedQuote();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      jsonrpc: "2.0",
      id: "castyard-quote",
      result: { message: { parts: [{ data: { action: "quote", quote } }] } },
    }), { status: 200 })));

    render(<ActivationPanel agentId={agentId} expectedProvider="0x3333333333333333333333333333333333333333" />);
    fireEvent.change(screen.getByLabelText("PancakeSwap V3 pool"), { target: { value: poolAddress } });
    fireEvent.change(screen.getByLabelText("Target range width (bps)"), { target: { value: "500" } });
    fireEvent.click(screen.getByRole("button", { name: "Get signed quote" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Unexpected quote provider");
    expect(screen.queryByText("Signature verified")).not.toBeInTheDocument();
  });
});
