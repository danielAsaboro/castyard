import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import capturedAgents from "@/features/agents/sources/fixtures/8004scan-category-agents.json";
import { normalize8004Agent } from "@/features/agents/sources/8004scan";
import { qualifyAgent } from "@/features/agents/qualify";
import { AGENT_CATEGORIES } from "@/features/agents/domain";
import { parseCatalogueQuery } from "./query";
import { queryCatalogue } from "./search";
import { CatalogueView } from "./catalogue-view";

const agents = capturedAgents.map((record) => qualifyAgent(normalize8004Agent(record)));

describe("marketplace catalogue view", () => {
  it("renders shareable search, facet, sort, and pagination controls", () => {
    const query = parseCatalogueQuery(new URLSearchParams([
      ["q", "grid agent"],
      ["category", "grid-trading"],
      ["network", "mainnet"],
      ["evidence", "claimed"],
      ["rail", "x402"],
      ["sort", "name"],
      ["perPage", "12"],
    ]));
    const result = queryCatalogue(agents, query);

    render(<CatalogueView categories={AGENT_CATEGORIES} query={query} result={result} />);

    expect(screen.getByRole("searchbox", { name: "Search agents" })).toHaveValue("grid agent");
    expect(screen.getByRole("checkbox", { name: "Grid trading" })).toBeChecked();
    expect(screen.getByRole("combobox", { name: "Network" })).toHaveValue("mainnet");
    expect(screen.getByRole("combobox", { name: "Evidence" })).toHaveValue("claimed");
    expect(screen.getByRole("combobox", { name: "Payment rail" })).toHaveValue("x402");
    expect(screen.getByRole("combobox", { name: "Sort results" })).toHaveValue("name");
    expect(screen.getByRole("combobox", { name: "Results per page" })).toHaveValue("12");
    expect(screen.getByRole("link", { name: "Clear all filters" })).toHaveAttribute("href", "/agents");
    expect(screen.getByText("Grid trading", { selector: ".active-filter-label" })).toBeInTheDocument();
  });

  it("renders honest empty results without example cards", () => {
    const query = parseCatalogueQuery({ q: "no matching live record" });
    const result = queryCatalogue(agents, query);

    render(<CatalogueView categories={AGENT_CATEGORIES} query={query} result={result} />);

    expect(screen.getByRole("status")).toHaveTextContent("No live agents match this search");
    expect(screen.queryAllByRole("article")).toHaveLength(0);
  });

  it("builds previous, numbered, and next links while preserving filters", () => {
    const query = parseCatalogueQuery({ q: "agent", network: "mainnet", page: "2", perPage: "12" });
    const base = queryCatalogue(agents, { ...query, page: 1 });
    const result = { ...base, page: 2, pageCount: 3, total: 36, from: 13, to: 24 };

    render(<CatalogueView categories={AGENT_CATEGORIES} query={query} result={result} />);

    expect(screen.getByText("13–24 of 36 agents")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Previous page" })).toHaveAttribute("href", expect.stringContaining("q=agent"));
    expect(screen.getByRole("link", { name: "Page 3" })).toHaveAttribute("href", expect.stringContaining("page=3"));
    expect(screen.getByRole("link", { name: "Next page" })).toHaveAttribute("href", expect.stringContaining("page=3"));
  });
});
