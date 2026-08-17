import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { EVMWalletProvider } from "@bnbagent/sdk";
import { AgentEndpoint, ERC8004Agent } from "@bnbagent/sdk/erc8004";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const secretPath = resolve(root, ".secrets/reference-seller.private-key");
const receiptPath = resolve(root, ".secrets/reference-seller-registration.json");
const baseUrl = process.env.REFERENCE_SELLER_BASE_URL;
if (!baseUrl || new URL(baseUrl).protocol !== "https:") {
  throw new Error("REFERENCE_SELLER_BASE_URL must be the public HTTPS origin");
}

const privateKey = (await readFile(secretPath, "utf8")).trim();
const wallet = new EVMWalletProvider({
  privateKey,
  password: privateKey,
  persist: false,
});
const agent = await ERC8004Agent.create({ walletProvider: wallet, network: "bsc-testnet" });
const endpoint = AgentEndpoint.a2a(new URL(baseUrl).origin, {
  version: "1.0",
  capabilities: ["ERC-8183", "rebalancing", "grid-trading", "yield-optimisation", "health-factor-monitoring"],
});
const agentUri = agent.generateAgentUri({
  name: "Castyard Reference Seller",
  description: "A standards-based ERC-8004 seller for four read-only BSC DeFi analysis skills, activated through funded ERC-8183 jobs.",
  endpoints: [endpoint],
  supportedTrust: ["reputation", "crypto-economic"],
});
const result = await agent.registerAgent(agentUri, [
  { key: "marketplace", value: "Castyard" },
  { key: "executionProtocol", value: "ERC-8183" },
]);

const receipt = {
  network: "bsc-testnet",
  chainId: 97,
  registry: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
  owner: agent.walletAddress,
  endpoint: endpoint.endpoint,
  agentId: result.agentId,
  transactionHash: result.transactionHash,
  registeredAt: new Date().toISOString(),
};
await writeFile(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
console.log(JSON.stringify(receipt, null, 2));
