import type { AgentCategory, AgentIdentity, CategoryClaim } from "./domain";

const PHRASES: Record<AgentCategory, readonly string[]> = {
  rebalancing: ["range rebalancer", "range manager", "liquidity range", "rebalancing", "rebalance"],
  "grid-trading": ["grid trading", "grid-trading", "grid trader", "grid bot", "bounded grid"],
  "yield-optimisation": [
    "risk-adjusted yield",
    "yield optimisation",
    "yield optimization",
    "yield optimiser",
    "yield optimizer",
    "yield-optimiser",
    "yield-optimizer",
  ],
  "health-factor-monitoring": [
    "health factor",
    "liquidation protection",
    "liquidation monitor",
    "lending rescue",
  ],
};

const DEFI_REBALANCING_CONTEXT = [
  "lp",
  "liquidity",
  "pancakeswap",
  "position",
  "portfolio",
  "defi",
];

function normalize(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("en-US");
}

export function classifyCategoryClaims(agent: AgentIdentity): CategoryClaim[] {
  const corpus = normalize(`${agent.name} ${agent.description}`);

  return (Object.entries(PHRASES) as [AgentCategory, readonly string[]][]).flatMap(
    ([category, phrases]) => {
      const matchedPhrase = phrases.find((phrase) => corpus.includes(phrase));
      if (!matchedPhrase) {
        return [];
      }
      if (
        category === "rebalancing" &&
        !DEFI_REBALANCING_CONTEXT.some((context) => corpus.includes(context))
      ) {
        return [];
      }
      return [{ category, matchedPhrase }];
    },
  );
}
