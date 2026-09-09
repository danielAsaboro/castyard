import { readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { EVMWalletProvider } from "@bnbagent/sdk";
import { ERC8183Client, JobStatus } from "@bnbagent/sdk/erc8183";
import { createPublicClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bscTestnet } from "viem/chains";

import { createJobDescription, type SignedQuote, verifySignedQuote } from "../src/features/activation/quote";
import { BSC_TESTNET_PROTOCOL } from "../src/features/activation/contracts";
import { sendSponsoredExactApproval } from "./sponsored-approval.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const secretPath = resolve(root, ".secrets/reference-buyer.private-key");
const evidencePath = resolve(root, ".secrets/reference-seller-erc8183-lifecycle.json");
const temporaryEvidencePath = `${evidencePath}.tmp`;
const baseUrl = new URL(process.env.REFERENCE_SELLER_BASE_URL ?? "https://castyard-agents.asaborodaniel.chatgpt.site").origin;
const provider = "0x74258A428e94294F14a8c8308CE21259223A0187" as const;
const privateKey = (await readFile(secretPath, "utf8")).trim() as `0x${string}`;
const account = privateKeyToAccount(privateKey);
const wallet = new EVMWalletProvider({ privateKey, password: privateKey, persist: false });
process.env.ERC8183_POLICY_ADDRESS ??= BSC_TESTNET_PROTOCOL.optimisticPolicy;
const client = await ERC8183Client.create({ walletProvider: wallet, network: "bsc-testnet" });
const publicClient = createPublicClient({ chain: bscTestnet, transport: http(process.env.BSC_TESTNET_RPC_URL ?? "https://data-seed-prebsc-1-s1.bnbchain.org:8545") });

type Evidence = Record<string, unknown> & { transactions: Record<string, string> };
async function save(evidence: Evidence) {
  await writeFile(temporaryEvidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  await rename(temporaryEvidencePath, evidencePath);
}

if (process.argv.includes("--settle")) {
  const evidence = JSON.parse(await readFile(evidencePath, "utf8")) as Evidence & { jobId: string };
  const jobId = BigInt(evidence.jobId);
  const job = await client.getJob(jobId);
  if (job.status === JobStatus.COMPLETED) {
    console.log(JSON.stringify({ jobId: evidence.jobId, status: "COMPLETED", alreadySettled: true }, null, 2));
    process.exit(0);
  }
  if (job.status !== JobStatus.SUBMITTED) throw new Error(`Job ${jobId} is not Submitted; current status is ${JobStatus[job.status]}`);
  const disputeWindow = await client.policy.disputeWindow();
  const settleAfter = job.submittedAt + disputeWindow;
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (now <= settleAfter) throw new Error(`Dispute window is still open; settle after unix ${settleAfter}`);
  const settled = await client.settle(jobId);
  const finalJob = await client.getJob(jobId);
  if (finalJob.status !== JobStatus.COMPLETED) throw new Error(`Expected Completed after settle, got ${JobStatus[finalJob.status]}`);
  evidence.transactions.settle = settled.transactionHash;
  evidence.status = "COMPLETED";
  evidence.settledAt = new Date().toISOString();
  await save(evidence);
  console.log(JSON.stringify({ jobId: evidence.jobId, status: evidence.status, transactionHash: settled.transactionHash }, null, 2));
  process.exit(0);
}

try {
  await readFile(evidencePath, "utf8");
  throw new Error("Lifecycle evidence already exists; use --settle or preserve/remove it before creating another job");
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}

const quoteRequest = {
  jsonrpc: "2.0",
  id: "castyard-live-erc8183",
  method: "SendMessage",
  params: {
    message: {
      messageId: crypto.randomUUID(),
      role: "ROLE_USER",
      parts: [{ data: { action: "quote", task: { skill: "rebalancing", parameters: { poolAddress: "0x145ecf200cf4eb61e61e5e9e73ed63f8643816df", rangeWidthBps: 1000 } } } }],
    },
  },
};
const quoteResponse = await fetch(`${baseUrl}/api/reference-seller/a2a`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(quoteRequest),
});
if (!quoteResponse.ok) throw new Error(`Quote endpoint failed with HTTP ${quoteResponse.status}`);
const quoteEnvelope = await quoteResponse.json() as { result?: { message?: { parts?: Array<{ data?: { quote?: SignedQuote } }> } } };
const quote = quoteEnvelope.result?.message?.parts?.[0]?.data?.quote;
if (!quote) throw new Error("Quote endpoint returned no signed quote");
await verifySignedQuote(quote, { expectedProvider: provider, now: Math.floor(Date.now() / 1000), usedNonces: new Set() });

const [paymentToken, balance, disputeWindow] = await Promise.all([
  client.paymentToken(),
  client.tokenBalance(account.address),
  client.policy.disputeWindow(),
]);
if (paymentToken.toLowerCase() !== quote.paymentToken.toLowerCase()) throw new Error("Quote payment token does not match AgenticCommerce");
if (balance < BigInt(quote.amount)) throw new Error(`Buyer ${account.address} needs at least ${quote.amount} raw U units; run wallet:reference-buyer-fund after adding tBNB`);

const evidence: Evidence = {
  network: "bsc-testnet",
  chainId: 97,
  baseUrl,
  buyer: account.address,
  provider,
  paymentToken,
  quote,
  disputeWindow: disputeWindow.toString(),
  transactions: {},
  status: "STARTED",
  startedAt: new Date().toISOString(),
};
await save(evidence);

const expiredAt = BigInt(Math.floor(Date.now() / 1000)) + disputeWindow + 7_200n;
const created = await client.createJob({ provider, expiredAt, description: createJobDescription(quote) });
if (created.jobId === null) throw new Error("createJob returned no job ID");
const jobId = created.jobId;
evidence.jobId = jobId.toString();
evidence.expiredAt = expiredAt.toString();
evidence.transactions.createJob = created.transactionHash;
evidence.status = "OPEN";
await save(evidence);

const registered = await client.registerJob(jobId);
evidence.transactions.registerJob = registered.transactionHash;
await save(evidence);
const budgeted = await client.setBudget(jobId, BigInt(quote.amount));
evidence.transactions.setBudget = budgeted.transactionHash;
await save(evidence);

const allowance = await client.tokenAllowance(account.address, client.commerce.address);
if (allowance < BigInt(quote.amount)) {
  const approved = await sendSponsoredExactApproval({
    wallet,
    publicClient,
    paymentToken,
    spender: client.commerce.address,
    amount: BigInt(quote.amount),
  });
  evidence.transactions.approve = approved.transactionHash;
  evidence.approvalMode = "MegaFuel-sponsored exact ERC-20 approval";
  await save(evidence);
}
const funded = await client.fund(jobId, BigInt(quote.amount), { approveFloor: 0n });
evidence.transactions.fund = funded.transactionHash;
evidence.status = "FUNDED";
await save(evidence);

const callbackResponse = await fetch(`${baseUrl}/api/reference-seller/jobs/${jobId}`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ quote }),
});
const callback = await callbackResponse.json() as Record<string, unknown>;
if (callbackResponse.status !== 201) throw new Error(`Seller callback failed with HTTP ${callbackResponse.status}: ${JSON.stringify(callback)}`);

const job = await client.getJob(jobId);
if (job.status !== JobStatus.SUBMITTED) throw new Error(`Expected Submitted, got ${JobStatus[job.status]}`);
if (String(callback.deliverableHash).toLowerCase() !== job.deliverable.toLowerCase()) throw new Error("Seller response hash does not match on-chain deliverable");
const manifestResponse = await fetch(`${baseUrl}/api/reference-seller/jobs/${jobId}?manifest=1`);
if (!manifestResponse.ok) throw new Error(`Public deliverable returned HTTP ${manifestResponse.status}`);
const manifest = await manifestResponse.json();

evidence.status = "SUBMITTED";
evidence.transactions.submit = String(callback.transactionHash);
evidence.deliverableHash = job.deliverable;
evidence.deliverable = manifest;
evidence.submittedAt = job.submittedAt.toString();
evidence.settleAfter = (job.submittedAt + disputeWindow).toString();
evidence.verifiedAt = new Date().toISOString();
evidence.verificationBlock = (await publicClient.getBlockNumber()).toString();
await save(evidence);
console.log(JSON.stringify({
  jobId: jobId.toString(),
  status: "SUBMITTED",
  buyer: account.address,
  provider,
  amount: quote.amount,
  deliverableHash: job.deliverable,
  transactions: evidence.transactions,
  settleAfter: evidence.settleAfter,
}, null, 2));
