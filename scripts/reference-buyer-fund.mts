import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createPublicClient, createWalletClient, formatEther, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bscTestnet } from "viem/chains";

import { BSC_TESTNET_PROTOCOL } from "../src/features/activation/contracts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const secretPath = resolve(root, ".secrets/reference-buyer.private-key");
const receiptPath = resolve(root, ".secrets/reference-buyer-faucet.json");
const privateKey = (await readFile(secretPath, "utf8")).trim() as `0x${string}`;
const account = privateKeyToAccount(privateKey);
const transport = http(process.env.BSC_TESTNET_RPC_URL ?? "https://data-seed-prebsc-1-s1.bnbchain.org:8545");
const publicClient = createPublicClient({ chain: bscTestnet, transport });
const walletClient = createWalletClient({ chain: bscTestnet, transport, account });
const faucet = "0x86e9197CC0F76E4e4aaa7082180945196bBAb5D3" as const;
const faucetAbi = [
  { type: "function", name: "allowedToWithdraw", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "requestTokens", stateMutability: "nonpayable", inputs: [], outputs: [] },
  { type: "function", name: "tokenAmount", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "tokenInstance", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
] as const;
const erc20Abi = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] },
] as const;

const [nativeBefore, eligible, tokenAmount, tokenInstance, tokenBefore] = await Promise.all([
  publicClient.getBalance({ address: account.address }),
  publicClient.readContract({ address: faucet, abi: faucetAbi, functionName: "allowedToWithdraw", args: [account.address] }),
  publicClient.readContract({ address: faucet, abi: faucetAbi, functionName: "tokenAmount" }),
  publicClient.readContract({ address: faucet, abi: faucetAbi, functionName: "tokenInstance" }),
  publicClient.readContract({ address: BSC_TESTNET_PROTOCOL.paymentToken, abi: erc20Abi, functionName: "balanceOf", args: [account.address] }),
]);
if (tokenInstance.toLowerCase() !== BSC_TESTNET_PROTOCOL.paymentToken.toLowerCase()) {
  throw new Error(`Faucet token mismatch: expected ${BSC_TESTNET_PROTOCOL.paymentToken}, got ${tokenInstance}`);
}
if (!eligible) throw new Error("Buyer wallet is not currently eligible for the official U faucet");
if (nativeBefore === 0n) throw new Error(`Buyer ${account.address} needs tBNB for the U faucet transaction`);

const transactionHash = await walletClient.writeContract({ address: faucet, abi: faucetAbi, functionName: "requestTokens" });
const receipt = await publicClient.waitForTransactionReceipt({ hash: transactionHash, confirmations: 1, timeout: 60_000 });
if (receipt.status !== "success") throw new Error("U faucet transaction reverted");
const tokenAfter = await publicClient.readContract({ address: BSC_TESTNET_PROTOCOL.paymentToken, abi: erc20Abi, functionName: "balanceOf", args: [account.address] });
if (tokenAfter <= tokenBefore) throw new Error("U faucet receipt succeeded but the buyer balance did not increase");

const evidence = {
  network: "bsc-testnet",
  chainId: 97,
  buyer: account.address,
  faucet,
  paymentToken: BSC_TESTNET_PROTOCOL.paymentToken,
  claimAmount: tokenAmount.toString(),
  balanceBefore: tokenBefore.toString(),
  balanceAfter: tokenAfter.toString(),
  nativeBalanceBefore: formatEther(nativeBefore),
  transactionHash,
  blockNumber: receipt.blockNumber.toString(),
  verifiedAt: new Date().toISOString(),
};
await writeFile(receiptPath, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
console.log(JSON.stringify(evidence, null, 2));
