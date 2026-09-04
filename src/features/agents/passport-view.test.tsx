import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { AgentPassport, RebalancingEvidence } from "./domain";
import { PassportView } from "./passport-view";

const source = {
  sourceName: "BNB LP Range Rebalancer",
  sourceUrl: "https://bnb-lp-api.172-104-171-139.nip.io",
  observedAt: "2026-08-17T13:26:14Z",
};

const rebalancingEvidence: RebalancingEvidence = {
  erc8004AgentTokenId: "265375",
  pancakePositionNftId: "7116214",
  source,
  chainId: 56,
  walletAddress: "0x20f1cA5d1e5A3Ee94C29DbF95e6BF6ceA6a8d64b",
  problems: [],
  serviceVersion: "1.0.0",
  network: "bsc-mainnet",
  protocol: "PancakeSwap V3",
  pair: "BNB/USDT",
  inRange: true,
  lowerPrice: 548.22,
  upperPrice: 670.27,
  currentPrice: 604.18,
  rangePercent: 10,
  triggerPercent: 5,
  maxSlippagePercent: 1,
  tvl: { value: 0.8079, definition: "Operator-reported current position value", observedAt: source.observedAt, source },
  pendingFees: { value: 0.00066, definition: "Operator-reported pending fees", observedAt: source.observedAt, source },
  gasCost: { value: 0.01924, definition: "Operator-reported gas", observedAt: source.observedAt, source },
  pnl: { value: -0.018079, definition: "Operator-reported fees minus gas", observedAt: source.observedAt, source, windowSeconds: 157038, windowComplete: false },
  apr: { value: 9.603, definition: "Operator-annualised fee APR", observedAt: source.observedAt, source, windowSeconds: 157038, windowComplete: false },
  rebalanceCount: 1,
  riskControls: ["exact-amount approvals, never unlimited"],
  receipts: ["a", "b", "c"].map((letter) => ({
    hash: `0x${letter.repeat(64)}`,
    explorerUrl: `https://bscscan.com/tx/0x${letter.repeat(64)}`,
  })),
  partialFailures: [],
};

const passport: AgentPassport = {
  identity: {
    agentId: "56:0x8004a169fb4a3325136eb29fa0ceb6d2e539a432:265375",
    erc8004AgentTokenId: "265375",
    chainId: 56,
    registryAddress: "0x8004a169fb4a3325136eb29fa0ceb6d2e539a432",
    ownerAddress: "0x20f1ca5d1e5a3ee94c29dbf95e6bf6cea6a8d64b",
    name: "BNB LP Range Rebalancer",
    description: "Autonomous PancakeSwap V3 LP range rebalancer.",
    supportedProtocols: ["A2A"],
    x402Supported: true,
    totalFeedbacks: 0,
    averageScore: 0,
    source: {
      sourceName: "8004scan",
      sourceUrl: "https://8004scan.io/agents/bsc/265375",
      observedAt: source.observedAt,
    },
  },
  categoryClaims: [{ category: "rebalancing", matchedPhrase: "range rebalancer" }],
  evidenceState: "observed",
  observation: rebalancingEvidence,
  qualificationProblems: [],
  rebalancingEvidence,
};

describe("Agent Passport view", () => {
  it("separates agent identity from the managed position", () => {
    render(<PassportView passport={passport} />);

    expect(screen.getByText("ERC-8004 agent token")).toBeInTheDocument();
    expect(screen.getByText("265375")).toBeInTheDocument();
    expect(screen.getByText("PancakeSwap position NFT")).toBeInTheDocument();
    expect(screen.getByText("7116214")).toBeInTheDocument();
  });

  it("shows unflattering and incomplete performance evidence honestly", () => {
    render(<PassportView passport={passport} />);

    expect(screen.getByText("-$0.02")).toBeInTheDocument();
    expect(screen.getAllByText("43.6h observed · incomplete").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/operator-reported/i).length).toBeGreaterThan(0);
  });

  it("renders all real explorer receipts with safe external links", () => {
    render(<PassportView passport={passport} />);

    const links = screen.getAllByRole("link", { name: /view bscscan receipt/i });
    expect(links).toHaveLength(3);
    expect(links.every((link) => link.getAttribute("rel") === "noopener noreferrer")).toBe(true);
  });

  it("makes the unqualified activation boundary explicit", () => {
    render(<PassportView passport={passport} />);

    expect(screen.getByText(/read-only evidence available/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /activate|execute/i })).not.toBeInTheDocument();
  });

  it("offers real signed-quote review only on the registered Castyard seller passport", () => {
    render(<PassportView passport={{
      ...passport,
      identity: {
        ...passport.identity,
        agentId: "97:0x8004a818bfb912233c491871b3d84c89a494bd9e:1830",
        erc8004AgentTokenId: "1830",
        chainId: 97,
        isTestnet: true,
        registryAddress: "0x8004a818bfb912233c491871b3d84c89a494bd9e",
        ownerAddress: "0x74258A428e94294F14a8c8308CE21259223A0187",
        name: "Castyard Reference Seller",
      },
      evidenceState: "registered",
      observation: undefined,
      rebalancingEvidence: undefined,
    }} />);

    expect(screen.getByText("Agent Passport · BSC testnet")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Define a read-only job" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Get signed quote" })).toBeInTheDocument();
    expect(screen.queryByText("No matching live records")).not.toBeInTheDocument();
    expect(screen.queryByText(/hiring and execution are not yet qualified/i)).not.toBeInTheDocument();
  });

  it("shows the reference seller's four validated skills with equal evidence depth", () => {
    render(<PassportView passport={{
      ...passport,
      identity: {
        ...passport.identity,
        agentId: "97:0x8004a818bfb912233c491871b3d84c89a494bd9e:1830",
        erc8004AgentTokenId: "1830",
        chainId: 97,
        isTestnet: true,
        registryAddress: "0x8004a818bfb912233c491871b3d84c89a494bd9e",
        ownerAddress: "0x74258A428e94294F14a8c8308CE21259223A0187",
        name: "Castyard Reference Seller",
      },
      categoryClaims: [
        { category: "rebalancing", matchedPhrase: "AgentCard · LP rebalancing analysis" },
        { category: "grid-trading", matchedPhrase: "AgentCard · Grid trading analysis" },
        { category: "yield-optimisation", matchedPhrase: "AgentCard · Yield market comparison" },
        { category: "health-factor-monitoring", matchedPhrase: "AgentCard · Account liquidity health check" },
      ],
      evidenceState: "claimed",
      observation: undefined,
      rebalancingEvidence: undefined,
    }} />);

    expect(screen.getByRole("heading", { name: "Four validated analysis contracts" })).toBeInTheDocument();
    expect(screen.getAllByText("Published AgentCard skill")).toHaveLength(4);
    expect(screen.getByRole("heading", { name: "Rebalancing" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Grid trading" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Yield optimisation" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Health-factor monitoring" })).toBeInTheDocument();
  });
});
