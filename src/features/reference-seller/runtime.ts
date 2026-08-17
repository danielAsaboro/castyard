import { EVMWalletProvider, resolveNetwork } from "@bnbagent/sdk";
import { ERC8183Client } from "@bnbagent/sdk/erc8183";
import {
  createPublicClient,
  http,
  isHex,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bscTestnet } from "viem/chains";

import type { ChainReader } from "./skills/execute";

export async function createReferenceSellerRuntime(privateKey: string, baseUrl: string, rpcUrl?: string) {
  if (!isHex(privateKey, { strict: true }) || privateKey.length !== 66) throw new Error("Invalid reference seller private key configuration");
  const account = privateKeyToAccount(privateKey);
  const resolvedRpcUrl = rpcUrl ?? "https://data-seed-prebsc-1-s1.bnbchain.org:8545";
  const transport = http(resolvedRpcUrl, { timeout: 15_000, retryCount: 2 });
  const publicClient = createPublicClient({ chain: bscTestnet, transport });
  const walletProvider = new EVMWalletProvider({ privateKey, password: privateKey, persist: false });
  const network = { ...resolveNetwork("bsc-testnet"), rpcUrl: resolvedRpcUrl };
  const commerce = await ERC8183Client.create({ walletProvider, network });
  const origin = new URL(baseUrl).origin;

  return {
    account,
    reader: publicClient as unknown as ChainReader,
    getJob: (jobId: bigint) => commerce.getJob(jobId),
    submit: async (jobId: bigint, deliverableHash: Hex) => {
      const result = await commerce.submit(jobId, deliverableHash, {
        deliverable_url: `${origin}/api/reference-seller/jobs/${jobId}?manifest=1`,
      });
      return result.transactionHash;
    },
    waitForReceipt: async (transactionHash: Hex) => {
      const receipt = await publicClient.waitForTransactionReceipt({ hash: transactionHash, confirmations: 1, timeout: 60_000 });
      return { status: receipt.status, blockNumber: receipt.blockNumber };
    },
  };
}
