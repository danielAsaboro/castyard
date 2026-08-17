import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { EvidenceValue, SourceStamp as SourceStampValue } from "@/features/agents/domain";
import { EvidenceBadge } from "./evidence-badge";
import { Metric } from "./metric";
import { SiteHeader } from "./site-header";
import { SourceStamp } from "./source-stamp";
import { UpstreamState } from "./upstream-state";

const source: SourceStampValue = {
  sourceName: "8004scan",
  sourceUrl: "https://8004scan.io/agents/bsc/265375",
  observedAt: "2026-08-17T13:00:00Z",
};

describe("evidence interface", () => {
  it("labels owner claims without calling them verified", () => {
    render(<EvidenceBadge state="claimed" />);

    expect(screen.getByText("Claimed capability")).toBeInTheDocument();
    expect(screen.queryByText(/verified/i)).not.toBeInTheDocument();
  });

  it("renders missing metrics honestly", () => {
    render(<Metric label="Net P&L" evidence={undefined} style="currency" />);

    expect(screen.getByText("Not published")).toBeInTheDocument();
  });

  it("announces a stale source and links safely to it", () => {
    render(
      <SourceStamp
        source={source}
        now={new Date("2026-08-17T13:03:00Z")}
        revalidationSeconds={60}
      />,
    );

    expect(screen.getByText(/stale/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /8004scan/i })).toHaveAttribute(
      "rel",
      "noopener noreferrer",
    );
  });

  it("shows the permanent registration caution in the global header", () => {
    render(<SiteHeader />);

    expect(screen.getByText("Registration proves identity, not performance or safety.")).toBeInTheDocument();
  });

  it("gives rate-limited users a recovery message", () => {
    render(<UpstreamState kind="rate-limit" retryAfter="60" />);

    expect(screen.getByRole("status")).toHaveTextContent("Source limit reached");
    expect(screen.getByText(/60 seconds/i)).toBeInTheDocument();
  });

  it("formats a published metric through its evidence value", () => {
    const evidence: EvidenceValue<number> = {
      value: -0.018079,
      definition: "Fees minus gas",
      observedAt: source.observedAt,
      source,
    };
    render(<Metric label="Net P&L" evidence={evidence} style="currency" />);

    expect(screen.getByText("-$0.02")).toBeInTheDocument();
    expect(screen.getByText("Fees minus gas")).toBeInTheDocument();
  });
});
