import {
  createPublicClient,
  createWalletClient,
  http,
  isHex,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bscTestnet } from "viem/chains";

import { BSC_TESTNET_PROTOCOL } from "@/features/activation/contracts";
import type { ChainReader } from "./skills/execute";

const commerceAbi = [
  {
    type: "function", name: "getJob", stateMutability: "view", inputs: [{ name: "jobId", type: "uint256" }],
    outputs: [{ type: "tuple", components: [
      { name: "id", type: "uint256" }, { name: "client", type: "address" }, { name: "provider", type: "address" },
      { name: "evaluator", type: "address" }, { name: "description", type: "string" }, { name: "budget", type: "uint256" },
      { name: "expiredAt", type: "uint256" }, { name: "status", type: "uint8" }, { name: "hook", type: "address" },
      { name: "submittedAt", type: "uint256" }, { name: "deliverable", type: "bytes32" },
    ] }],
  },
  { type: "function", name: "submit", stateMutability: "nonpayable", inputs: [{ name: "jobId", type: "uint256" }, { name: "deliverable", type: "bytes32" }, { name: "optParams", type: "bytes" }], outputs: [] },
] as const;

export function createReferenceSellerRuntime(privateKey: string, rpcUrl?: string) {
  if (!isHex(privateKey, { strict: true }) || privateKey.length !== 66) throw new Error("Invalid reference seller private key configuration");
  const account = privateKeyToAccount(privateKey);
  const transport = http(rpcUrl ?? "https://data-seed-prebsc-1-s1.bnbchain.org:8545", { timeout: 15_000, retryCount: 2 });
  const publicClient = createPublicClient({ chain: bscTestnet, transport });
  const walletClient = createWalletClient({ chain: bscTestnet, transport, account });

  return {
    account,
    reader: publicClient as unknown as ChainReader,
    getJob: async (jobId: bigint) => publicClient.readContract({
      address: BSC_TESTNET_PROTOCOL.commerce,
      abi: commerceAbi,
      functionName: "getJob",
      args: [jobId],
    }),
    submit: async (jobId: bigint, deliverableHash: Hex) => walletClient.writeContract({
      address: BSC_TESTNET_PROTOCOL.commerce,
      abi: commerceAbi,
      functionName: "submit",
      args: [jobId, deliverableHash, "0x"],
    }),
    waitForReceipt: async (transactionHash: Hex) => {
      const receipt = await publicClient.waitForTransactionReceipt({ hash: transactionHash, confirmations: 1, timeout: 60_000 });
      return { status: receipt.status, blockNumber: receipt.blockNumber };
    },
  };
}
