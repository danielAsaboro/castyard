import { describe, expect, it } from "vitest";

import type { EvidenceValue, SourceStamp } from "./domain";
import {
  formatAddress,
  formatEvidenceValue,
  formatTimestamp,
  formatWindow,
  getFreshness,
  isTransactionHash,
} from "./format";

const source: SourceStamp = {
  sourceName: "live service",
  sourceUrl: "https://example.com",
  observedAt: "2026-08-17T13:00:00Z",
};

function evidence(value: number | undefined): EvidenceValue<number> {
  return {
    value,
    definition: "Net outcome after gas",
    observedAt: source.observedAt,
    source,
  };
}

describe("evidence formatting", () => {
  it("does not turn missing evidence into zero", () => {
    expect(formatEvidenceValue(evidence(undefined), { style: "currency" })).toBe("Not published");
    expect(formatEvidenceValue(evidence(0), { style: "currency" })).toBe("$0.00");
  });

  it("preserves a negative P&L", () => {
    expect(formatEvidenceValue(evidence(-0.018079), { style: "currency" })).toBe("-$0.02");
  });

  it("formats percentages without claiming extra precision", () => {
    expect(formatEvidenceValue(evidence(9.603012), { style: "percent" })).toBe("9.60%");
  });

  it("labels an incomplete observation window", () => {
    expect(formatWindow({ windowSeconds: 157_038, windowComplete: false })).toBe(
      "43.6h observed · incomplete",
    );
  });

  it("marks a source stale after two revalidation windows", () => {
    expect(getFreshness(source, new Date("2026-08-17T13:01:30Z"), 60)).toBe("current");
    expect(getFreshness(source, new Date("2026-08-17T13:02:01Z"), 60)).toBe("stale");
  });

  it("formats source identifiers deterministically", () => {
    expect(formatAddress("0x20f1ca5d1e5a3ee94c29dbf95e6bf6cea6a8d64b")).toBe("0x20f1…8d64b");
    expect(formatTimestamp("2026-08-17T13:00:00Z")).toBe("Aug 17, 2026, 1:00 PM UTC");
  });

  it("accepts only full EVM transaction hashes", () => {
    expect(isTransactionHash(`0x${"a".repeat(64)}`)).toBe(true);
    expect(isTransactionHash("0x1234")).toBe(false);
  });
});
