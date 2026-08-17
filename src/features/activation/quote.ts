import {
  getAddress,
  isAddress,
  isHex,
  keccak256,
  recoverTypedDataAddress,
  toHex,
  type Address,
  type Hex,
} from "viem";
import type { PrivateKeyAccount } from "viem/accounts";

import { BSC_TESTNET_PROTOCOL } from "./contracts";

export type ReferenceSellerTask =
  | { skill: "rebalancing"; parameters: { poolAddress: Address; rangeWidthBps: number } }
  | { skill: "grid-trading"; parameters: { poolAddress: Address; lowerPrice: number; upperPrice: number; levels: number } }
  | { skill: "yield-optimisation"; parameters: { markets: Address[] } }
  | { skill: "health-factor-monitoring"; parameters: { comptrollerAddress: Address; account: Address } };

type QuoteMessage = {
  provider: Address;
  agentId: string;
  taskCommitment: Hex;
  paymentToken: Address;
  amount: bigint;
  expiresAt: bigint;
  nonce: Hex;
};

export type SignedQuote = {
  provider: Address;
  agentId: string;
  task: ReferenceSellerTask;
  taskCommitment: Hex;
  paymentToken: Address;
  amount: string;
  expiresAt: number;
  nonce: Hex;
  signature: Hex;
};

const domain = {
  name: "Castyard Reference Seller",
  version: "1",
  chainId: BSC_TESTNET_PROTOCOL.chainId,
  verifyingContract: BSC_TESTNET_PROTOCOL.commerce,
} as const;

const types = {
  Quote: [
    { name: "provider", type: "address" },
    { name: "agentId", type: "string" },
    { name: "taskCommitment", type: "bytes32" },
    { name: "paymentToken", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "expiresAt", type: "uint64" },
    { name: "nonce", type: "bytes32" },
  ],
} as const;

function assertObject(value: unknown, label: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function checkedAddress(value: unknown, label: string): Address {
  if (typeof value !== "string" || !isAddress(value, { strict: true })) {
    throw new Error(`${label} must be a valid EVM address`);
  }
  return getAddress(value);
}

function checkedNumber(value: unknown, label: string, minimum: number, maximum: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be between ${minimum} and ${maximum}`);
  }
  return value;
}

export function validateTask(value: unknown): ReferenceSellerTask {
  assertObject(value, "task");
  assertObject(value.parameters, "task.parameters");
  const parameters = value.parameters;

  switch (value.skill) {
    case "rebalancing":
      return {
        skill: value.skill,
        parameters: {
          poolAddress: checkedAddress(parameters.poolAddress, "poolAddress"),
          rangeWidthBps: checkedNumber(parameters.rangeWidthBps, "rangeWidthBps", 1, 10_000),
        },
      };
    case "grid-trading": {
      const lowerPrice = checkedNumber(parameters.lowerPrice, "lowerPrice", Number.MIN_VALUE, Number.MAX_SAFE_INTEGER);
      const upperPrice = checkedNumber(parameters.upperPrice, "upperPrice", Number.MIN_VALUE, Number.MAX_SAFE_INTEGER);
      if (lowerPrice >= upperPrice) throw new Error("lowerPrice must be less than upperPrice");
      return {
        skill: value.skill,
        parameters: {
          poolAddress: checkedAddress(parameters.poolAddress, "poolAddress"),
          lowerPrice,
          upperPrice,
          levels: checkedNumber(parameters.levels, "levels", 2, 100),
        },
      };
    }
    case "yield-optimisation": {
      if (!Array.isArray(parameters.markets) || parameters.markets.length < 1 || parameters.markets.length > 20) {
        throw new Error("markets must contain between 1 and 20 addresses");
      }
      return {
        skill: value.skill,
        parameters: { markets: parameters.markets.map((market) => checkedAddress(market, "market")) },
      };
    }
    case "health-factor-monitoring":
      return {
        skill: value.skill,
        parameters: {
          comptrollerAddress: checkedAddress(parameters.comptrollerAddress, "comptrollerAddress"),
          account: checkedAddress(parameters.account, "account"),
        },
      };
    default:
      throw new Error("Unsupported skill");
  }
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(",")}}`;
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new Error("Task contains a non-serializable value");
  return encoded;
}

export function hashTaskCommitment(task: unknown): Hex {
  return keccak256(toHex(canonicalJson(validateTask(task))));
}

export function createJobDescription(quote: Pick<SignedQuote, "taskCommitment" | "nonce">): string {
  return `castyard:v1:${quote.taskCommitment}:${quote.nonce}`;
}

function quoteMessage(quote: Omit<SignedQuote, "task" | "signature">): QuoteMessage {
  return {
    provider: quote.provider,
    agentId: quote.agentId,
    taskCommitment: quote.taskCommitment,
    paymentToken: quote.paymentToken,
    amount: BigInt(quote.amount),
    expiresAt: BigInt(quote.expiresAt),
    nonce: quote.nonce,
  };
}

export async function createSignedQuote(input: {
  account: PrivateKeyAccount;
  agentId: string;
  task: unknown;
  amount: bigint;
  now: number;
  ttlSeconds: number;
  nonce: Hex;
}): Promise<SignedQuote> {
  if (!/^97:0x[0-9a-fA-F]{40}:[1-9][0-9]*$/.test(input.agentId)) throw new Error("Invalid BSC testnet agent ID");
  if (input.amount <= 0n) throw new Error("Quote amount must be positive");
  if (!Number.isInteger(input.now) || input.now <= 0) throw new Error("Invalid quote time");
  if (!Number.isInteger(input.ttlSeconds) || input.ttlSeconds < 1 || input.ttlSeconds > 900) throw new Error("Quote TTL must be between 1 and 900 seconds");
  if (!isHex(input.nonce, { strict: true }) || input.nonce.length !== 66) throw new Error("Nonce must be bytes32");

  const task = validateTask(input.task);
  const unsigned = {
    provider: getAddress(input.account.address),
    agentId: input.agentId,
    taskCommitment: hashTaskCommitment(task),
    paymentToken: getAddress(BSC_TESTNET_PROTOCOL.paymentToken),
    amount: input.amount.toString(),
    expiresAt: input.now + input.ttlSeconds,
    nonce: input.nonce,
  };
  const signature = await input.account.signTypedData({
    domain,
    types,
    primaryType: "Quote",
    message: quoteMessage(unsigned),
  });
  return { ...unsigned, task, signature };
}

export async function verifySignedQuote(
  quote: SignedQuote,
  options: { expectedProvider: Address; now: number; usedNonces: ReadonlySet<string> },
): Promise<SignedQuote> {
  const provider = checkedAddress(quote.provider, "provider");
  if (provider !== getAddress(options.expectedProvider)) throw new Error("Unexpected quote provider");
  if (!Number.isSafeInteger(quote.expiresAt) || options.now > quote.expiresAt) throw new Error("Quote expired");
  if (options.usedNonces.has(quote.nonce)) throw new Error("Quote nonce has already been used");
  if (!isHex(quote.nonce, { strict: true }) || quote.nonce.length !== 66) throw new Error("Invalid quote nonce");
  if (quote.paymentToken !== getAddress(BSC_TESTNET_PROTOCOL.paymentToken)) throw new Error("Unexpected payment token");
  if (BigInt(quote.amount) <= 0n) throw new Error("Invalid quote amount");
  const task = validateTask(quote.task);
  if (hashTaskCommitment(task) !== quote.taskCommitment) throw new Error("Task commitment mismatch");

  const recovered = await recoverTypedDataAddress({
    domain,
    types,
    primaryType: "Quote",
    message: quoteMessage(quote),
    signature: quote.signature,
  });
  if (recovered !== provider) throw new Error("Invalid quote signature");
  return { ...quote, provider, task };
}
