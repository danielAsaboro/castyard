export const evidenceStates = ["registered", "claimed", "observed"] as const;

export type EvidenceState = (typeof evidenceStates)[number];

export const AGENT_CATEGORIES = [
  {
    slug: "rebalancing",
    label: "Rebalancing",
    description: "Keeps concentrated-liquidity positions inside a declared operating range.",
    evidenceChecklist: [
      "Position type and pool",
      "Range state and trigger",
      "Fees and gas",
      "Slippage controls",
      "Execution receipts",
    ],
  },
  {
    slug: "grid-trading",
    label: "Grid trading",
    description: "Places bounded trades across a declared price grid and stop policy.",
    evidenceChecklist: [
      "Pair, bounds, and levels",
      "Capital and fills",
      "Fees and P&L window",
      "Drawdown",
      "Stop rules",
    ],
  },
  {
    slug: "yield-optimisation",
    label: "Yield optimisation",
    description: "Compares eligible venues using net yield, cost, liquidity, and risk.",
    evidenceChecklist: [
      "Supported venues",
      "Net APR formula",
      "Rewards and liquidity",
      "Lockups and gas",
      "Strategy-change history",
    ],
  },
  {
    slug: "health-factor-monitoring",
    label: "Health-factor monitoring",
    description: "Watches lending risk and proposes or performs a tightly bounded repair.",
    evidenceChecklist: [
      "Protocol and market",
      "Health-factor source",
      "Trigger and latency",
      "Allowed repair calls",
      "Spend cap and receipt",
    ],
  },
] as const;

export type AgentCategory = (typeof AGENT_CATEGORIES)[number]["slug"];

export interface SourceStamp {
  sourceName: string;
  sourceUrl: string;
  observedAt: string;
  upstreamAt?: string;
  requestId?: string;
}

export interface AgentIdentity {
  agentId: string;
  erc8004AgentTokenId: string;
  chainId: 56 | 97;
  isTestnet: boolean;
  registryAddress: string;
  ownerAddress: string;
  name: string;
  description: string;
  supportedProtocols: string[];
  x402Supported: boolean;
  totalFeedbacks?: number;
  averageScore?: number;
  createdAt?: string;
  updatedAt?: string;
  source: SourceStamp;
}

export interface CategoryClaim {
  category: AgentCategory;
  matchedPhrase: string;
}

export interface AgentObservation {
  source: SourceStamp;
  chainId: number;
  walletAddress?: string;
  problems: string[];
}

export interface AgentSummary {
  identity: AgentIdentity;
  categoryClaims: CategoryClaim[];
  evidenceState: EvidenceState;
  observation?: AgentObservation;
  qualificationProblems: string[];
}

export interface EvidenceValue<T> {
  value?: T;
  unit?: string;
  definition: string;
  observedAt: string;
  windowSeconds?: number;
  windowComplete?: boolean;
  source: SourceStamp;
}

export interface TransactionReceipt {
  hash: string;
  explorerUrl: string;
}

export interface RebalancingEvidence extends AgentObservation {
  erc8004AgentTokenId: string;
  pancakePositionNftId?: string;
  serviceVersion?: string;
  network?: string;
  blockNumber?: number;
  protocol?: string;
  pair?: string;
  inRange?: boolean;
  lowerPrice?: number;
  upperPrice?: number;
  currentPrice?: number;
  rangePercent?: number;
  triggerPercent?: number;
  maxSlippagePercent?: number;
  triggerSemantics?: string;
  targetLowerPrice?: number;
  targetUpperPrice?: number;
  tvl?: EvidenceValue<number>;
  pendingFees?: EvidenceValue<number>;
  gasCost?: EvidenceValue<number>;
  pnl?: EvidenceValue<number>;
  apr?: EvidenceValue<number>;
  rebalanceCount?: number;
  lastRebalanceAt?: string;
  riskControls: string[];
  receipts: TransactionReceipt[];
  partialFailures: string[];
}

export interface AgentPassport extends AgentSummary {
  rebalancingEvidence?: RebalancingEvidence;
}
