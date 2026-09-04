import { describe, expect, it } from "vitest";

import { buildExactApprovalIntent } from "./sponsored-approval.mjs";

describe("sponsored payment approval", () => {
  it("builds a single exact-amount ERC-20 approval for AgenticCommerce", () => {
    const intent = buildExactApprovalIntent(
      "0xc70B8741B8B07A6d61E54fd4B20f22Fa648E5565",
      "0xa206c0517B6371C6638CD9e4a42Cc9f02A33B0DE",
      10_000_000_000_000_000n,
    );

    expect(intent.call?.address).toBe("0xc70B8741B8B07A6d61E54fd4B20f22Fa648E5565");
    expect(intent.call?.functionName).toBe("approve");
    expect(intent.call?.args).toEqual([
      "0xa206c0517B6371C6638CD9e4a42Cc9f02A33B0DE",
      10_000_000_000_000_000n,
    ]);
    expect(intent.value).toBe(0n);
  });
});
