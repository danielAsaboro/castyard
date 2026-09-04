import { createPublicClient, getAddress, http } from "viem";
import { bscTestnet } from "viem/chains";

import { buildBrowserActivationCalls } from "../src/features/activation/browser-lifecycle";
import { BSC_TESTNET_PROTOCOL, REFERENCE_SELLER_AGENT_ID } from "../src/features/activation/contracts";
import { verifySignedQuote, type SignedQuote } from "../src/features/activation/quote";

const baseUrl = new URL(process.env.REFERENCE_SELLER_BASE_URL ?? "https://castyard-agents.asaborodaniel.chatgpt.site").origin;
const provider = getAddress("0x74258A428e94294F14a8c8308CE21259223A0187");
const buyer = getAddress(process.env.REFERENCE_BUYER_ADDRESS ?? "0x291DB336D8b50C373F05045155c0fA7CdECe1451");
const poolAddress = getAddress("0x145ECf200CF4Eb61e61E5E9E73eD63F8643816df");
const rpcUrl = process.env.BSC_TESTNET_RPC_URL ?? "https://data-seed-prebsc-1-s1.bnbchain.org:8545";

const quoteResponse = await fetch(`${baseUrl}/api/reference-seller/a2a`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: "castyard-browser-preflight",
    method: "message/send",
    params: {
      message: {
        messageId: crypto.randomUUID(),
        role: "ROLE_USER",
        parts: [{ data: { action: "quote", task: { skill: "rebalancing", parameters: { poolAddress, rangeWidthBps: 1_000 } } } }],
      },
    },
  }),
});
if (!quoteResponse.ok) throw new Error(`Quote endpoint returned HTTP ${quoteResponse.status}`);
const quoteBody = await quoteResponse.json() as {
  result?: { message?: { parts?: Array<{ data?: { action?: unknown; quote?: SignedQuote } }> } };
};
const quote = quoteBody.result?.message?.parts?.find((part) => part.data?.action === "quote")?.data?.quote;
if (!quote) throw new Error("Quote endpoint returned no signed quote");
const now = Math.floor(Date.now() / 1_000);
const verified = await verifySignedQuote(quote, { expectedProvider: provider, now, usedNonces: new Set() });
if (verified.agentId !== REFERENCE_SELLER_AGENT_ID) throw new Error("Quote agent does not match the registered seller");

const client = createPublicClient({ chain: bscTestnet, transport: http(rpcUrl) });
const [chainId, blockNumber, disputeWindow, balance] = await Promise.all([
  client.getChainId(),
  client.getBlockNumber(),
  client.readContract({
    address: BSC_TESTNET_PROTOCOL.optimisticPolicy,
    abi: [{ type: "function", name: "disputeWindow", stateMutability: "view", inputs: [], outputs: [{ type: "uint64" }] }] as const,
    functionName: "disputeWindow",
  }),
  client.readContract({
    address: BSC_TESTNET_PROTOCOL.paymentToken,
    abi: [{ type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ type: "address" }], outputs: [{ type: "uint256" }] }] as const,
    functionName: "balanceOf",
    args: [buyer],
  }),
]);
if (chainId !== BSC_TESTNET_PROTOCOL.chainId) throw new Error(`RPC returned chain ${chainId}`);

const calls = buildBrowserActivationCalls(verified, disputeWindow, now);
const simulation = await client.simulateContract({ ...calls.createJob, account: buyer });
if (typeof simulation.result !== "bigint" || simulation.result <= 0n) throw new Error("createJob preflight returned no predicted job ID");

console.log(JSON.stringify({
  ok: true,
  writePerformed: false,
  chainId,
  blockNumber: blockNumber.toString(),
  buyer,
  buyerRawUBalance: balance.toString(),
  provider,
  quoteAmount: verified.amount,
  quoteExpiresAt: verified.expiresAt,
  disputeWindow: disputeWindow.toString(),
  predictedJobId: simulation.result.toString(),
  calls: {
    createJob: calls.createJob.functionName,
    registerJob: calls.registerJob.functionName,
    setBudget: calls.setBudget.functionName,
    approve: calls.approve.functionName,
    fund: calls.fund.functionName,
    settle: calls.settle.functionName,
    cancel: calls.cancel.functionName,
    claimRefund: calls.claimRefund.functionName,
    markExpired: calls.markExpired.functionName,
  },
}, null, 2));
