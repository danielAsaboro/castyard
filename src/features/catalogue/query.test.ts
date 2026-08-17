import { describe, expect, it } from "vitest";

import { parseCatalogueQuery, serializeCatalogueQuery } from "./query";

describe("catalogue query contract", () => {
  it("uses bounded canonical defaults", () => {
    expect(parseCatalogueQuery({})).toEqual({
      q: "",
      categories: [],
      network: "all",
      evidence: "all",
      rail: "all",
      sort: "relevance",
      page: 1,
      perPage: 24,
    });
  });

  it("accepts repeated categories and trims an English query", () => {
    const input = new URLSearchParams([
      ["q", "  live grid agents  "],
      ["category", "grid-trading"],
      ["category", "rebalancing"],
      ["network", "testnet"],
      ["evidence", "observed"],
      ["rail", "erc8183"],
      ["sort", "freshness"],
      ["page", "3"],
      ["perPage", "48"],
    ]);

    expect(parseCatalogueQuery(input)).toEqual({
      q: "live grid agents",
      categories: ["grid-trading", "rebalancing"],
      network: "testnet",
      evidence: "observed",
      rail: "erc8183",
      sort: "freshness",
      page: 3,
      perPage: 48,
    });
  });

  it("rejects unknown facets and clamps unsafe numeric input", () => {
    expect(parseCatalogueQuery({
      category: ["not-a-category", "yield-optimisation"],
      network: "sidechain",
      evidence: "safe",
      rail: "wire",
      sort: "score",
      page: "-4",
      perPage: "999",
    })).toEqual({
      q: "",
      categories: ["yield-optimisation"],
      network: "all",
      evidence: "all",
      rail: "all",
      sort: "relevance",
      page: 1,
      perPage: 24,
    });
  });

  it("round-trips non-default state without empty parameters", () => {
    const query = parseCatalogueQuery(new URLSearchParams([
      ["q", "health factor"],
      ["category", "health-factor-monitoring"],
      ["network", "mainnet"],
      ["evidence", "claimed"],
      ["rail", "x402"],
      ["sort", "name"],
      ["page", "2"],
      ["perPage", "12"],
    ]));
    const serialized = serializeCatalogueQuery(query);

    expect(serialized.getAll("category")).toEqual(["health-factor-monitoring"]);
    expect(serialized.has("unused")).toBe(false);
    expect(parseCatalogueQuery(serialized)).toEqual(query);
  });
});
