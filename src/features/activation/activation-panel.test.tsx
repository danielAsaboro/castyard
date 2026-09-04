import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { privateKeyToAccount } from "viem/accounts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { BrowserActivationDependencies } from "./browser-lifecycle";
import {
  connectBrowserActivation,
  createInitialBrowserReceipt,
  loadBrowserActivationReceipt,
  saveBrowserActivationReceipt,
} from "./browser-wallet";
import { createSignedQuote, type ReferenceSellerTask } from "./quote";
import { ActivationPanel } from "./activation-panel";

vi.mock("./browser-wallet", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./browser-wallet")>();
  return {
    ...actual,
    connectBrowserActivation: vi.fn(),
    loadBrowserActivationReceipt: vi.fn(),
    saveBrowserActivationReceipt: vi.fn(),
  };
});

const account = privateKeyToAccount(`0x${"11".repeat(32)}`);
const agentId = "97:0x8004a818bfb912233c491871b3d84c89a494bd9e:1830";
const poolAddress = "0x1111111111111111111111111111111111111111";

beforeEach(() => {
  vi.mocked(loadBrowserActivationReceipt).mockReturnValue(null);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

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

const remainingSkillTasks: Array<{ label: string; skill: ReferenceSellerTask["skill"]; task: ReferenceSellerTask }> = [
  {
    label: "Grid trading",
    skill: "grid-trading",
    task: {
      skill: "grid-trading",
      parameters: {
        poolAddress: "0x145ECf200CF4Eb61e61E5E9E73eD63F8643816df",
        lowerPrice: 0.9,
        upperPrice: 1.1,
        levels: 5,
      },
    },
  },
  {
    label: "Yield optimisation",
    skill: "yield-optimisation",
    task: {
      skill: "yield-optimisation",
      parameters: { markets: ["0xD5C4C2e2facBEB59D0216D0595d63FcDc6F9A1a7"] },
    },
  },
  {
    label: "Health-factor monitoring",
    skill: "health-factor-monitoring",
    task: {
      skill: "health-factor-monitoring",
      parameters: {
        comptrollerAddress: "0x94d1820b2D1c7c7452A163983Dc888CEC546b77D",
        account: "0x74258A428e94294F14a8c8308CE21259223A0187",
      },
    },
  },
];

describe("reference seller activation panel", () => {
  it("keeps all four marketplace skills available as structured tasks", () => {
    render(<ActivationPanel agentId={agentId} expectedProvider={account.address} />);

    const skill = screen.getByLabelText("Analysis skill");
    expect(screen.getByRole("option", { name: "Rebalancing" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Grid trading" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Yield optimisation" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Health-factor monitoring" })).toBeInTheDocument();
    expect(screen.getByLabelText("PancakeSwap V3 pool")).toHaveValue("0x145ECf200CF4Eb61e61E5E9E73eD63F8643816df");
    expect(screen.getByLabelText("Target range width (bps)")).toHaveValue(1000);

    fireEvent.change(skill, { target: { value: "grid-trading" } });
    expect(screen.getByLabelText("Lower price")).toHaveValue(0.9);
    expect(screen.getByLabelText("Upper price")).toHaveValue(1.1);
    expect(screen.getByLabelText("Grid levels")).toHaveValue(5);

    fireEvent.change(skill, { target: { value: "yield-optimisation" } });
    expect(screen.getByLabelText("Venus market addresses")).toHaveValue("0xD5C4C2e2facBEB59D0216D0595d63FcDc6F9A1a7");

    fireEvent.change(skill, { target: { value: "health-factor-monitoring" } });
    expect(screen.getByLabelText("Comptroller address")).toBeRequired();
    expect(screen.getByLabelText("Account to inspect")).toBeRequired();
    expect(screen.getByLabelText("Comptroller address")).toHaveValue("0x94d1820b2D1c7c7452A163983Dc888CEC546b77D");
    expect(screen.getByLabelText("Account to inspect")).toHaveValue("0x74258A428e94294F14a8c8308CE21259223A0187");
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

  it.each(remainingSkillTasks)("serializes and verifies the $label task contract", async ({ skill, task }) => {
    const quote = await createSignedQuote({
      account,
      agentId,
      task,
      amount: 10_000_000_000_000_000n,
      now: Math.floor(Date.now() / 1000),
      ttlSeconds: 600,
      nonce: `0x${({
        "grid-trading": "33",
        "yield-optimisation": "44",
        "health-factor-monitoring": "55",
      } as const)[skill].repeat(32)}`,
    });
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      jsonrpc: "2.0",
      id: "castyard-quote",
      result: { message: { parts: [{ data: { action: "quote", quote } }] } },
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetcher);

    render(<ActivationPanel agentId={agentId} expectedProvider={account.address} />);
    fireEvent.change(screen.getByLabelText("Analysis skill"), { target: { value: skill } });
    fireEvent.click(screen.getByRole("button", { name: "Get signed quote" }));

    await screen.findByText("Signature verified");
    const request = JSON.parse(String((fetcher.mock.calls[0]?.[1] as RequestInit).body));
    expect(request.params.message.parts[0].data).toEqual({ action: "quote", task });
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

  it("connects an explicit browser buyer and starts a resumable receipt", async () => {
    const quote = await signedQuote();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      jsonrpc: "2.0",
      id: "castyard-quote",
      result: { message: { parts: [{ data: { action: "quote", quote } }] } },
    }), { status: 200 })));
    const buyer = "0x291DB336D8b50C373F05045155c0fA7CdECe1451" as const;
    const dependencies: BrowserActivationDependencies = {
      now: () => Math.floor(Date.now() / 1_000),
      buyer,
      expectedProvider: account.address,
      readDisputeWindow: async () => 3_600n,
      readTokenBalance: async () => BigInt(quote.amount),
      readTokenAllowance: async () => 0n,
      readJob: async () => { throw new Error("not used by this test"); },
      write: async () => { throw new Error("not used by this test"); },
      notifySeller: async () => { throw new Error("not used by this test"); },
    };
    vi.mocked(connectBrowserActivation).mockResolvedValue({ buyer, dependencies });

    render(<ActivationPanel agentId={agentId} expectedProvider={account.address} />);
    fireEvent.change(screen.getByLabelText("PancakeSwap V3 pool"), { target: { value: poolAddress } });
    fireEvent.change(screen.getByLabelText("Target range width (bps)"), { target: { value: "500" } });
    fireEvent.click(screen.getByRole("button", { name: "Get signed quote" }));
    await screen.findByText("Signature verified");
    fireEvent.click(screen.getByRole("button", { name: "Connect wallet and start" }));

    await waitFor(() => expect(screen.getByText("Receipt state: quoted")).toBeInTheDocument());
    expect(screen.getByText(`Buyer ${buyer}`)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1. Create ERC-8183 job" })).toBeInTheDocument();
    expect(connectBrowserActivation).toHaveBeenCalledWith(account.address);
    expect(saveBrowserActivationReceipt).toHaveBeenCalledWith(expect.objectContaining({ buyer, stage: "quoted", quote }));
  });

  it("re-verifies a saved receipt before displaying its quote as trusted", async () => {
    const restored = createInitialBrowserReceipt(
      await signedQuote(),
      "0x291DB336D8b50C373F05045155c0fA7CdECe1451",
    );
    vi.mocked(loadBrowserActivationReceipt).mockReturnValue(restored);

    render(<ActivationPanel agentId={agentId} expectedProvider="0x3333333333333333333333333333333333333333" />);

    expect(await screen.findByRole("alert")).toHaveTextContent("Saved receipt rejected: Unexpected quote provider");
    expect(screen.queryByText("Signature verified")).not.toBeInTheDocument();
  });

  it("offers explicit cancellation when an unfunded job is resumed", async () => {
    const quote = await signedQuote();
    const buyer = "0x291DB336D8b50C373F05045155c0fA7CdECe1451" as const;
    const restored = {
      ...createInitialBrowserReceipt(quote, buyer),
      stage: "open" as const,
      jobId: "42",
      expiredAt: String(Math.floor(Date.now() / 1_000) + 90_000),
      transactions: { createJob: `0x${"aa".repeat(32)}` as const },
    };
    const dependencies: BrowserActivationDependencies = {
      now: () => Math.floor(Date.now() / 1_000),
      buyer,
      expectedProvider: account.address,
      readDisputeWindow: async () => 86_400n,
      readTokenBalance: async () => BigInt(quote.amount),
      readTokenAllowance: async () => 0n,
      readJob: async () => { throw new Error("not used by this test"); },
      write: async () => { throw new Error("not used by this test"); },
      notifySeller: async () => { throw new Error("not used by this test"); },
    };
    vi.mocked(loadBrowserActivationReceipt).mockReturnValue(restored);
    vi.mocked(connectBrowserActivation).mockResolvedValue({ buyer, dependencies });

    render(<ActivationPanel agentId={agentId} expectedProvider={account.address} />);
    await screen.findByText("Receipt state: open");
    expect(screen.getByRole("button", { name: "Get signed quote" })).toBeDisabled();
    expect(screen.getByText("Finish, cancel, or refund the active job before requesting another quote.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Download receipt JSON" })).toHaveAttribute("download", "castyard-erc8183-job-42.json");
    fireEvent.click(screen.getByRole("button", { name: "Reconnect wallet to resume" }));

    expect(await screen.findByRole("button", { name: "2. Register evaluation policy" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel unfunded job" })).toBeInTheDocument();
  });

  it("restores an expired quote after its job exists so the buyer can recover or cancel", async () => {
    const quote = await createSignedQuote({
      account,
      agentId,
      task: { skill: "rebalancing", parameters: { poolAddress, rangeWidthBps: 500 } },
      amount: 10_000_000_000_000_000n,
      now: 1_000,
      ttlSeconds: 600,
      nonce: `0x${"44".repeat(32)}`,
    });
    const buyer = "0x291DB336D8b50C373F05045155c0fA7CdECe1451" as const;
    vi.mocked(loadBrowserActivationReceipt).mockReturnValue({
      ...createInitialBrowserReceipt(quote, buyer, new Date("2026-09-04T00:00:00.000Z")),
      stage: "open",
      jobId: "42",
      expiredAt: "9999999999",
      transactions: { createJob: `0x${"aa".repeat(32)}` },
    });

    render(<ActivationPanel agentId={agentId} expectedProvider={account.address} />);

    expect(await screen.findByText("Receipt state: open")).toBeInTheDocument();
    expect(await screen.findByText("The quote expired. Cancel this unfunded job before requesting a new quote.", {}, { timeout: 2_000 })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reconnect wallet to resume" })).toBeInTheDocument();
  });
});
