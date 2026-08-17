import { describe, expect, it } from "vitest";

import { AGENT_CATEGORIES, evidenceStates } from "./domain";

describe("agent domain", () => {
  it("defines every judged category once", () => {
    expect(AGENT_CATEGORIES.map((category) => category.slug)).toEqual([
      "rebalancing",
      "grid-trading",
      "yield-optimisation",
      "health-factor-monitoring",
    ]);
  });

  it("cannot represent activatable as a Batch 1 evidence state", () => {
    expect(evidenceStates).toEqual(["registered", "claimed", "observed"]);
    expect(evidenceStates).not.toContain("activatable");
  });
});
