import type { Address } from "viem";

import { validateTask } from "@/features/activation/quote";

export type ChainReader = {
  getBlockNumber(): Promise<bigint>;
  getBlock(parameters: { blockNumber: bigint }): Promise<{ timestamp: bigint }>;
  readContract(parameters: {
    address: Address;
    abi: readonly unknown[];
    functionName: string;
    args?: readonly unknown[];
    blockNumber: bigint;
  }): Promise<unknown>;
};

type Source = {
  protocol: "PancakeSwap V3" | "Venus";
  chainId: 97;
  contract: Address;
  blockNumber: string;
  calls: string[];
};

export type SkillResult = {
  skill: string;
  chainId: 97;
  blockNumber: string;
  observedAt: string;
  sources: Source[];
  assumptions: string[];
  data: Record<string, unknown>;
};

const v3PoolAbi = [
  { type: "function", name: "slot0", stateMutability: "view", inputs: [], outputs: [
    { name: "sqrtPriceX96", type: "uint160" }, { name: "tick", type: "int24" },
    { name: "observationIndex", type: "uint16" }, { name: "observationCardinality", type: "uint16" },
    { name: "observationCardinalityNext", type: "uint16" }, { name: "feeProtocol", type: "uint32" },
    { name: "unlocked", type: "bool" },
  ] },
  { type: "function", name: "liquidity", stateMutability: "view", inputs: [], outputs: [{ type: "uint128" }] },
  { type: "function", name: "fee", stateMutability: "view", inputs: [], outputs: [{ type: "uint24" }] },
  { type: "function", name: "token0", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "token1", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
] as const;

const venusMarketAbi = [
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "supplyRatePerBlock", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "borrowRatePerBlock", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "getCash", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "totalBorrows", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
] as const;

const comptrollerAbi = [{
  type: "function", name: "getAccountLiquidity", stateMutability: "view",
  inputs: [{ name: "account", type: "address" }],
  outputs: [{ type: "uint256" }, { type: "uint256" }, { type: "uint256" }],
}] as const;

function asTuple(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} returned an invalid response`);
  return value;
}

function asBigInt(value: unknown, label: string): bigint {
  if (typeof value !== "bigint") throw new Error(`${label} returned an invalid integer`);
  return value;
}

function annualPercentage(ratePerBlock: bigint): number | null {
  const estimate = Math.expm1(Number(ratePerBlock) / 1e18 * 10_512_000) * 100;
  return Number.isFinite(estimate) ? Number(estimate.toFixed(4)) : null;
}

async function poolSnapshot(reader: ChainReader, poolAddress: Address, blockNumber: bigint) {
  const read = (functionName: string) => reader.readContract({ address: poolAddress, abi: v3PoolAbi, functionName, blockNumber });
  const [slotValue, liquidityValue, feeValue, token0, token1] = await Promise.all([
    read("slot0"), read("liquidity"), read("fee"), read("token0"), read("token1"),
  ]);
  const slot = asTuple(slotValue, "slot0");
  if (slot.length < 7 || typeof slot[1] !== "number" || typeof slot[6] !== "boolean") throw new Error("slot0 returned an invalid response");
  if (typeof token0 !== "string" || typeof token1 !== "string" || typeof feeValue !== "number") throw new Error("Pool metadata returned an invalid response");
  return {
    token0,
    token1,
    feeHundredthsOfBip: feeValue,
    currentSqrtPriceX96: asBigInt(slot[0], "slot0.sqrtPriceX96").toString(),
    currentTick: slot[1],
    liquidity: asBigInt(liquidityValue, "liquidity").toString(),
    unlocked: slot[6],
  };
}

export async function executeReferenceSkill(taskInput: unknown, reader: ChainReader): Promise<SkillResult> {
  const task = validateTask(taskInput);
  const blockNumber = await reader.getBlockNumber();
  const block = await reader.getBlock({ blockNumber });
  const base = {
    skill: task.skill,
    chainId: 97 as const,
    blockNumber: blockNumber.toString(),
    observedAt: new Date(Number(block.timestamp) * 1000).toISOString(),
  };

  if (task.skill === "rebalancing" || task.skill === "grid-trading") {
    const pool = await poolSnapshot(reader, task.parameters.poolAddress, blockNumber);
    const source: Source = {
      protocol: "PancakeSwap V3", chainId: 97, contract: task.parameters.poolAddress,
      blockNumber: blockNumber.toString(), calls: ["slot0", "liquidity", "fee", "token0", "token1"],
    };
    if (task.skill === "rebalancing") {
      const halfWidthTicks = Math.max(1, Math.round(Math.log1p(task.parameters.rangeWidthBps / 10_000) / Math.log(1.0001) / 2));
      return {
        ...base,
        sources: [source],
        assumptions: ["The suggested range is symmetric around the observed tick and does not forecast price or account for token decimals.", "This read-only analysis does not move liquidity or user funds."],
        data: { ...pool, suggestedLowerTick: pool.currentTick - halfWidthTicks, suggestedUpperTick: pool.currentTick + halfWidthTicks, requestedRangeWidthBps: task.parameters.rangeWidthBps },
      };
    }
    const step = (task.parameters.upperPrice - task.parameters.lowerPrice) / (task.parameters.levels - 1);
    return {
      ...base,
      sources: [source],
      assumptions: ["Grid prices are caller-defined analytical levels; no orders or swaps are created.", "The onchain tick and sqrt price are reported raw because token decimal normalization requires separate token metadata."],
      data: { ...pool, lowerPrice: task.parameters.lowerPrice, upperPrice: task.parameters.upperPrice, levels: Array.from({ length: task.parameters.levels }, (_, index) => Number((task.parameters.lowerPrice + step * index).toPrecision(12))) },
    };
  }

  if (task.skill === "yield-optimisation") {
    const markets = await Promise.all(task.parameters.markets.map(async (market) => {
      const read = (functionName: string) => reader.readContract({ address: market, abi: venusMarketAbi, functionName, blockNumber });
      const [symbol, supplyRate, borrowRate, cash, totalBorrows] = await Promise.all([
        read("symbol"), read("supplyRatePerBlock"), read("borrowRatePerBlock"), read("getCash"), read("totalBorrows"),
      ]);
      if (typeof symbol !== "string") throw new Error("symbol returned an invalid response");
      const supply = asBigInt(supplyRate, "supplyRatePerBlock");
      const borrow = asBigInt(borrowRate, "borrowRatePerBlock");
      return { market, symbol, supplyRatePerBlock: supply.toString(), borrowRatePerBlock: borrow.toString(), estimatedSupplyApyPercent: annualPercentage(supply), estimatedBorrowApyPercent: annualPercentage(borrow), cash: asBigInt(cash, "getCash").toString(), totalBorrows: asBigInt(totalBorrows, "totalBorrows").toString() };
    }));
    return {
      ...base,
      sources: task.parameters.markets.map((contract) => ({ protocol: "Venus" as const, chainId: 97 as const, contract, blockNumber: blockNumber.toString(), calls: ["symbol", "supplyRatePerBlock", "borrowRatePerBlock", "getCash", "totalBorrows"] })),
      assumptions: ["APY estimates compound the observed per-block rate using 10,512,000 BSC blocks per year; realized rates and block cadence vary.", "Market balances are raw underlying units and are not normalized across token decimals."],
      data: { markets },
    };
  }

  const response = asTuple(await reader.readContract({ address: task.parameters.comptrollerAddress, abi: comptrollerAbi, functionName: "getAccountLiquidity", args: [task.parameters.account], blockNumber }), "getAccountLiquidity");
  if (response.length < 3) throw new Error("getAccountLiquidity returned an invalid response");
  const errorCode = asBigInt(response[0], "errorCode");
  const liquidity = asBigInt(response[1], "liquidity");
  const shortfall = asBigInt(response[2], "shortfall");
  return {
    ...base,
    sources: [{ protocol: "Venus", chainId: 97, contract: task.parameters.comptrollerAddress, blockNumber: blockNumber.toString(), calls: ["getAccountLiquidity"] }],
    assumptions: ["Liquidity and shortfall are raw Comptroller mantissas, not a derived health factor; interpretation depends on the selected Venus deployment and oracle."],
    data: { account: task.parameters.account, errorCode: errorCode.toString(), liquidityMantissa: liquidity.toString(), shortfallMantissa: shortfall.toString(), status: errorCode !== 0n ? "error" : shortfall > 0n ? "shortfall" : "liquid" },
  };
}
