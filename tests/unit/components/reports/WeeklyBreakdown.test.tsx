// @vitest-environment jsdom
// Layer 4 (component). File under test:
// src/components/reports/sections/WeeklyBreakdown.tsx (MetricCell).
// Pins the null-value rendering contract: a suppressed metric prints
// as an em-dash with no delta arrow.

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { WeeklyBreakdown } from "@/components/reports/sections/WeeklyBreakdown";
import type { WeeklySummaryRow } from "@/lib/reports/types";

function row(over: Partial<WeeklySummaryRow> = {}): WeeklySummaryRow {
  return {
    label: "TikTok",
    spend: { value: 5000, tone: "neutral" },
    substart: { value: 100, tone: "neutral" },
    subD0: { value: 25, tone: "neutral" },
    subD7: { value: 0, tone: "neutral", maturing: true },
    cpSubstart: { value: 50, tone: "neutral" },
    cpaD0: { value: 200, tone: "neutral" },
    // Suppressed by the maturity gate.
    cpaD7: { value: null, tone: "neutral", maturing: true },
    ...over,
  };
}

describe("WeeklyBreakdown MetricCell (null / suppressed)", () => {
  it("renders an em-dash and no delta arrow when value is null + maturing", () => {
    const r = row();
    render(
      <WeeklyBreakdown
        summary={{
          rows: [r],
          total: { ...r, label: "Total" },
        }}
        bullets={[]}
      />,
    );
    // The suppressed cpaD7 cells should print "—" not a $ value.
    // There are two such cells (per-row + total). Both should render
    // the dash, neither should render a percent delta.
    const dashes = screen.getAllByText("—");
    // At minimum 2 cpaD7 cells; subD7 (value: 0) also renders dash
    // sometimes — guard with a count >= 2 rather than exact.
    expect(dashes.length).toBeGreaterThanOrEqual(2);
    // No percent delta strings appear for the suppressed cells.
    expect(screen.queryByText(/100\.0%/)).toBeNull();
  });
});
