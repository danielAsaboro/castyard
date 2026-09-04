"use client";

import {
  createPublicClient,
  createWalletClient,
  custom,
  getAddress,
  http,
  isAddress,
  isHex,
  type Abi,
  type Address,
  type EIP1193Provider,
  type Hex,
} from "viem";
import { bscTestnet } from "viem/chains";

import {
  commerceBrowserAbi,
  type BrowserActivationDependencies,
  type BrowserActivationReceipt,
  type BrowserContractCall,
} from "./browser-lifecycle";
import { BSC_TESTNET_PROTOCOL } from "./contracts";
import type { SignedQuote } from "./quote";

const BSC_TESTNET_RPC_URL = "https://data-seed-prebsc-1-s1.bnbchain.org:8545";
const receiptKeyPrefix = "castyard:erc8183:v1:";

const policyReadAbi = [{
  type: "function",
  name: "disputeWindow",
  stateMutability: "view",
  inputs: [],
  outputs: [{ name: "", type: "uint64" }],
}] as const;

const erc20ReadAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }, { name: "spender", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

function injectedProvider(): EIP1193Provider {
  if (typeof window === "undefined") throw new Error("Browser wallet access is only available in a browser");
  const provider = (window as typeof window & { ethereum?: EIP1193Provider }).ethereum;
  if (!provider) throw new Error("No EIP-1193 browser wallet was detected");
  return provider;
}

function checkedHash(value: unknown, label: string): Hex {
  if (typeof value !== "string" || !isHex(value, { strict: true }) || value.length !== 66) {
    throw new Error(`${label} is not a transaction or bytes32 hash`);
  }
  return value;
}

function storageKey(agentId: string) {
  return `${receiptKeyPrefix}${agentId}`;
}

export async function fetchSellerSubmission(
  jobId: bigint,
  quote: SignedQuote,
  fetcher: typeof fetch = fetch,
): Promise<{ transactionHash: Hex; deliverableHash: Hex; deliverable: unknown }> {
  const response = await fetcher(`/api/reference-seller/jobs/${jobId}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ quote }),
  });
  let body = await response.json() as Record<string, unknown>;

  if (response.status === 409) {
    const recovery = await fetcher(`/api/reference-seller/jobs/${jobId}`, { headers: { "cache-control": "no-cache" } });
    body = await recovery.json() as Record<string, unknown>;
    if (!recovery.ok || body.state !== "submitted") {
      throw new Error(typeof body.error === "string" ? body.error : "Seller job is still processing; retry shortly");
    }
  } else if (response.status !== 201) {
    throw new Error(typeof body.error === "string" ? body.error : `Seller notification failed with HTTP ${response.status}`);
  }

  return {
    transactionHash: checkedHash(body.transactionHash, "Seller submission transaction"),
    deliverableHash: checkedHash(body.deliverableHash, "Seller deliverable"),
    deliverable: body.deliverable,
  };
}

export function createInitialBrowserReceipt(quote: SignedQuote, buyer: Address, at = new Date()): BrowserActivationReceipt {
  return {
    version: 1,
    quote,
    buyer: getAddress(buyer),
    stage: "quoted",
    transactions: {},
    updatedAt: at.toISOString(),
  };
}

export function saveBrowserActivationReceipt(receipt: BrowserActivationReceipt, storage: Storage = window.localStorage) {
  storage.setItem(storageKey(receipt.quote.agentId), JSON.stringify(receipt));
}

export function loadBrowserActivationReceipt(agentId: string, storage: Storage = window.localStorage): BrowserActivationReceipt | null {
  const raw = storage.getItem(storageKey(agentId));
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<BrowserActivationReceipt>;
    if (value.version !== 1 || value.quote?.agentId !== agentId || !value.buyer || !isAddress(value.buyer, { strict: true })) {
      return null;
    }
    if (!value.stage || !value.transactions || typeof value.updatedAt !== "string") return null;
    return value as BrowserActivationReceipt;
  } catch {
    return null;
  }
}

export async function connectBrowserActivation(expectedProvider: Address): Promise<{
  buyer: Address;
  dependencies: BrowserActivationDependencies;
}> {
  const provider = injectedProvider();
  const walletClient = createWalletClient({ chain: bscTestnet, transport: custom(provider) });
  const addresses = await walletClient.requestAddresses();
  if (!addresses[0]) throw new Error("Browser wallet returned no account");
  const buyer = getAddress(addresses[0]);
  const currentChain = await walletClient.getChainId();
  if (currentChain !== BSC_TESTNET_PROTOCOL.chainId) {
    try {
      await walletClient.switchChain({ id: BSC_TESTNET_PROTOCOL.chainId });
    } catch (error) {
      const code = (error as { code?: unknown }).code;
      if (code !== 4902) throw error;
      await walletClient.addChain({ chain: bscTestnet });
      await walletClient.switchChain({ id: BSC_TESTNET_PROTOCOL.chainId });
    }
  }

  const publicClient = createPublicClient({ chain: bscTestnet, transport: http(BSC_TESTNET_RPC_URL) });

  async function write(call: BrowserContractCall) {
    const simulation = await publicClient.simulateContract({
      account: buyer,
      address: call.address,
      abi: call.abi as Abi,
      functionName: call.functionName,
      args: call.args,
    });
    const transactionHash = await walletClient.writeContract(simulation.request);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: transactionHash });
    if (receipt.status !== "success") throw new Error(`${call.functionName} transaction reverted`);
    return {
      transactionHash,
      logs: receipt.logs.map((log) => ({ address: log.address, data: log.data, topics: log.topics })),
    };
  }

  const dependencies: BrowserActivationDependencies = {
    now: () => Math.floor(Date.now() / 1_000),
    buyer,
    expectedProvider: getAddress(expectedProvider),
    readDisputeWindow: () => publicClient.readContract({
      address: BSC_TESTNET_PROTOCOL.optimisticPolicy,
      abi: policyReadAbi,
      functionName: "disputeWindow",
    }),
    readTokenBalance: (account) => publicClient.readContract({
      address: BSC_TESTNET_PROTOCOL.paymentToken,
      abi: erc20ReadAbi,
      functionName: "balanceOf",
      args: [account],
    }),
    readTokenAllowance: (owner, spender) => publicClient.readContract({
      address: BSC_TESTNET_PROTOCOL.paymentToken,
      abi: erc20ReadAbi,
      functionName: "allowance",
      args: [owner, spender],
    }),
    readJob: (jobId) => publicClient.readContract({
      address: BSC_TESTNET_PROTOCOL.commerce,
      abi: commerceBrowserAbi,
      functionName: "getJob",
      args: [jobId],
    }),
    write,
    notifySeller: async (jobId, quote) => {
      const submission = await fetchSellerSubmission(jobId, quote);
      const job = await publicClient.readContract({
        address: BSC_TESTNET_PROTOCOL.commerce,
        abi: commerceBrowserAbi,
        functionName: "getJob",
        args: [jobId],
      });
      if (job.status !== 2) throw new Error("Seller callback did not leave the job Submitted");
      if (job.deliverable.toLowerCase() !== submission.deliverableHash.toLowerCase()) {
        throw new Error("Seller callback deliverable does not match AgenticCommerce");
      }
      if (job.submittedAt <= 0n) throw new Error("Submitted job has no on-chain submission time");
      return { ...submission, submittedAt: job.submittedAt };
    },
  };

  return { buyer, dependencies };
}
