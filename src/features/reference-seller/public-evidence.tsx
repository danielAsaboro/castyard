import { createPublicClient, http, type Address } from "viem";
import { bscTestnet } from "viem/chains";

import { executeReferenceSkill, type ChainReader, type SkillResult } from "./skills/execute";

const labels: Record<string, string> = {
  rebalancing: "Rebalancing",
  "grid-trading": "Grid trading",
  "yield-optimisation": "Yield optimisation",
  "health-factor-monitoring": "Health-factor monitoring",
};

const pancakePool = "0x145ECf200CF4Eb61e61E5E9E73eD63F8643816df" as Address;
const venusUsdc = "0xD5C4C2e2facBEB59D0216D0595d63FcDc6F9A1a7" as Address;
const venusComptroller = "0x94d1820b2D1c7c7452A163983Dc888CEC546b77D" as Address;
const zeroAccount = "0x0000000000000000000000000000000000000000" as Address;

const evidenceTasks = [
  { skill: "rebalancing", parameters: { poolAddress: pancakePool, rangeWidthBps: 1000 } },
  { skill: "grid-trading", parameters: { poolAddress: pancakePool, lowerPrice: 0.9, upperPrice: 1.1, levels: 5 } },
  { skill: "yield-optimisation", parameters: { markets: [venusUsdc] } },
  { skill: "health-factor-monitoring", parameters: { comptrollerAddress: venusComptroller, account: zeroAccount } },
] as const;

export async function loadPublicReferenceEvidence(rpcUrl = "https://data-seed-prebsc-1-s1.bnbchain.org:8545"): Promise<SkillResult[]> {
  const client = createPublicClient({ chain: bscTestnet, transport: http(rpcUrl, { timeout: 12_000, retryCount: 1 }) });
  const reader = client as unknown as ChainReader;
  return Promise.all(evidenceTasks.map((task) => executeReferenceSkill(task, reader)));
}

export function ReferenceSkillEvidenceGrid({ results }: { results: SkillResult[] }) {
  return (
    <div className="live-skill-grid">
      {results.map((result) => {
        const source = result.sources[0];
        return (
          <article className="paper-panel live-skill-card" key={result.skill}>
            <div className="skill-contract-state"><span>Live BSC testnet read</span><strong>Block {result.blockNumber}</strong></div>
            <h3>{labels[result.skill] ?? result.skill}</h3>
            <p className="live-skill-time">Observed onchain {new Date(result.observedAt).toLocaleString("en-US", { timeZone: "UTC", timeZoneName: "short" })}</p>
            {source ? (
              <dl>
                <div><dt>Protocol</dt><dd>{source.protocol}</dd></div>
                <div><dt>Contract</dt><dd><a href={`https://testnet.bscscan.com/address/${source.contract}`} target="_blank" rel="noopener noreferrer">{source.contract}</a></dd></div>
                <div><dt>Calls</dt><dd>{source.calls.join(", ")}</dd></div>
              </dl>
            ) : null}
            <details>
              <summary>Inspect returned data and assumptions</summary>
              <pre>{JSON.stringify(result.data, null, 2)}</pre>
              <ul>{result.assumptions.map((assumption) => <li key={assumption}>{assumption}</li>)}</ul>
            </details>
          </article>
        );
      })}
    </div>
  );
}
