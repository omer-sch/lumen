// Layer 4 (frontend component). Files under test:
// src/components/dashboard/attribution/CoverageWarningCard.tsx
// src/components/dashboard/attribution/CoverageWarningsRow.tsx
//
// Covers: status pill variant rendering, default-warning roster
// composition, and empty-list behavior.

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  CoverageWarningCard,
  type CoverageStatus,
} from "@/components/dashboard/attribution/CoverageWarningCard";
import { CoverageWarningsRow } from "@/components/dashboard/attribution/CoverageWarningsRow";

describe("CoverageWarningCard", () => {
  it.each<[CoverageStatus, string]>([
    ["Stale", "stale"],
    ["Missing", "missing"],
    ["Unverified", "unverified"],
  ])("renders the %s status pill", (status, slug) => {
    render(
      <CoverageWarningCard
        title="Test warning"
        status={status}
        impact="Something is partial."
      />,
    );
    expect(screen.getByTestId(`coverage-status-${slug}`)).toBeInTheDocument();
    expect(
      screen.getByTestId("attribution-coverage-test-warning"),
    ).toHaveAttribute("data-status", slug);
  });

  it("renders the lastUpdated subtitle when provided", () => {
    render(
      <CoverageWarningCard
        title="SKAd"
        status="Stale"
        impact="iOS coverage incomplete."
        lastUpdated="Stale since 2025-08-04"
      />,
    );
    expect(screen.getByText("Stale since 2025-08-04")).toBeInTheDocument();
  });

  it("renders the impact line", () => {
    render(
      <CoverageWarningCard
        title="Pubmint"
        status="Missing"
        impact="Spend table doesn't exist for Pubmint."
      />,
    );
    expect(
      screen.getByText("Spend table doesn't exist for Pubmint."),
    ).toBeInTheDocument();
  });

  it("renders the 'Open for BI' signal badge", () => {
    render(
      <CoverageWarningCard title="X" status="Unverified" impact="..." />,
    );
    expect(screen.getByText(/Open for BI/i)).toBeInTheDocument();
  });
});

describe("CoverageWarningsRow", () => {
  it("renders the three default warnings (SKAd, Pubmint, event_date)", () => {
    render(<CoverageWarningsRow />);
    expect(
      screen.getByTestId("attribution-coverage-warnings"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("attribution-coverage-skadnetwork-ingestion"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("attribution-coverage-pubmint-spend"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("attribution-coverage-event-date-semantics"),
    ).toBeInTheDocument();
  });

  it("renders nothing when the warnings list is empty", () => {
    const { container } = render(<CoverageWarningsRow warnings={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders custom warnings when overridden", () => {
    render(
      <CoverageWarningsRow
        warnings={[
          {
            title: "Just one",
            status: "Stale",
            impact: "Single warning override.",
          },
        ]}
      />,
    );
    expect(
      screen.getByTestId("attribution-coverage-just-one"),
    ).toBeInTheDocument();
    // No defaults render when a custom list is passed.
    expect(
      screen.queryByTestId("attribution-coverage-skadnetwork-ingestion"),
    ).toBeNull();
  });
});
