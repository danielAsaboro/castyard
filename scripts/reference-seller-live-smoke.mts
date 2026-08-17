import { createPublicClient, http, type Address } from "viem";
import { bscTestnet } from "viem/chains";

import { executeReferenceSkill, type ChainReader } from "../src/features/reference-seller/skills/execute";

const rpcUrl = process.env.BSC_TESTNET_RPC_URL ?? "https://data-seed-prebsc-1-s1.bnbchain.org:8545";
const client = createPublicClient({ chain: bscTestnet, transport: http(rpcUrl, { timeout: 15_000 }) });
const reader = client as unknown as ChainReader;

const pancakePool = "0x145ecf200cf4eb61e61e5e9e73ed63f8643816df" as Address;
const venusUsdc = "0xD5C4C2e2facBEB59D0216D0595d63FcDc6F9A1a7" as Address;
const venusComptroller = "0x94d1820b2D1c7c7452A163983Dc888CEC546b77D" as Address;
const zeroAccount = "0x0000000000000000000000000000000000000000" as Address;

const tasks = [
  { skill: "rebalancing", parameters: { poolAddress: pancakePool, rangeWidthBps: 1000 } },
  { skill: "grid-trading", parameters: { poolAddress: pancakePool, lowerPrice: 0.9, upperPrice: 1.1, levels: 5 } },
  { skill: "yield-optimisation", parameters: { markets: [venusUsdc] } },
  { skill: "health-factor-monitoring", parameters: { comptrollerAddress: venusComptroller, account: zeroAccount } },
] as const;

const results = [];
for (const task of tasks) results.push(await executeReferenceSkill(task, reader));

console.log(JSON.stringify({ rpcUrl: new URL(rpcUrl).origin, verifiedAt: new Date().toISOString(), results }, null, 2));
