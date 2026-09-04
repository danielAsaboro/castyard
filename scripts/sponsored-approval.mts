import { Paymaster, resolveNetwork, type EVMWalletProvider } from "@bnbagent/sdk";
import type { Address, PublicClient } from "viem";

const approveAbi = [{
  type: "function",
  name: "approve",
  stateMutability: "nonpayable",
  inputs: [{ name: "spender", type: "address" }, { name: "amount", type: "uint256" }],
  outputs: [{ type: "bool" }],
}] as const;

export function buildExactApprovalIntent(paymentToken: Address, spender: Address, amount: bigint) {
  if (amount <= 0n) throw new Error("Approval amount must be positive");
  return {
    name: "erc20.approve",
    call: {
      address: paymentToken,
      abi: approveAbi,
      functionName: "approve",
      args: [spender, amount] as const,
    },
    value: 0n,
    description: "Approve exact ERC-8183 payment amount",
  };
}

export async function sendSponsoredExactApproval(input: {
  wallet: EVMWalletProvider;
  publicClient: PublicClient;
  paymentToken: Address;
  spender: Address;
  amount: bigint;
}) {
  const network = resolveNetwork("bsc-testnet");
  if (!network.paymasterUrl) throw new Error("BSC testnet paymaster URL is unavailable");
  const executor = input.wallet.makeExecutor({
    client: input.publicClient,
    paymaster: new Paymaster(network.paymasterUrl),
    relayUnseenTimeout: 60,
  });
  return executor.execute(buildExactApprovalIntent(input.paymentToken, input.spender, input.amount));
}
