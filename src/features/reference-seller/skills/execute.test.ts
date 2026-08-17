import { describe, expect, it } from "vitest";

import { executeReferenceSkill, type ChainReader } from "./execute";

const address = (digit: string) => `0x${digit.repeat(40)}` as `0x${string}`;

function reader(results: Record<string, unknown>): ChainReader {
  return {
    getBlockNumber: async () => 12345n,
    getBlock: async () => ({ timestamp: 1_787_000_000n }),
    readContract: async ({ functionName }) => {
      if (!(functionName in results)) throw new Error(`Unexpected read: ${functionName}`);
      return results[functionName];
    },
  };
}

describe("reference seller live-data skills", () => {
  it.each([
    ["rebalancing", { skill: "rebalancing", parameters: { poolAddress: address("1"), rangeWidthBps: 1000 } }],
    ["grid-trading", { skill: "grid-trading", parameters: { poolAddress: address("1"), lowerPrice: 1, upperPrice: 2, levels: 4 } }],
  ])("reads a V3 pool for %s with provenance", async (_label, task) => {
    const result = await executeReferenceSkill(task, reader({
      slot0: [79228162514264337593543950336n, 0, 0, 0, 0, 0, true],
      liquidity: 500n,
      fee: 2500,
      token0: address("2"),
      token1: address("3"),
    }));
    expect(result).toMatchObject({ chainId: 97, blockNumber: "12345", observedAt: "2026-08-17T20:53:20.000Z", skill: task.skill });
    expect(result.sources[0]).toMatchObject({ contract: address("1"), protocol: "PancakeSwap V3" });
    expect(result.data).toMatchObject({ currentTick: 0, liquidity: "500" });
  });

  it("compares caller-selected Venus markets", async () => {
    const result = await executeReferenceSkill({ skill: "yield-optimisation", parameters: { markets: [address("4")] } }, reader({
      symbol: "vUSDC",
      supplyRatePerBlock: 1_000_000_000n,
      borrowRatePerBlock: 2_000_000_000n,
      getCash: 1_000_000n,
      totalBorrows: 500_000n,
    }));
    expect(result.sources[0]).toMatchObject({ contract: address("4"), protocol: "Venus" });
    expect(result.data).toMatchObject({ markets: [{ symbol: "vUSDC", supplyRatePerBlock: "1000000000" }] });
  });

  it("reads Venus account liquidity without inventing a health factor", async () => {
    const result = await executeReferenceSkill({
      skill: "health-factor-monitoring",
      parameters: { comptrollerAddress: address("5"), account: address("6") },
    }, reader({ getAccountLiquidity: [0n, 10_000n, 0n] }));
    expect(result.data).toEqual({ account: address("6"), errorCode: "0", liquidityMantissa: "10000", shortfallMantissa: "0", status: "liquid" });
    expect(result.assumptions.join(" ")).toContain("not a derived health factor");
  });

  it("returns an explicit degraded failure when a live read fails", async () => {
    const failing: ChainReader = {
      getBlockNumber: async () => 9n,
      getBlock: async () => ({ timestamp: 1n }),
      readContract: async () => { throw new Error("RPC unavailable"); },
    };
    await expect(executeReferenceSkill({ skill: "rebalancing", parameters: { poolAddress: address("1"), rangeWidthBps: 1000 } }, failing))
      .rejects.toThrow("RPC unavailable");
  });
});
