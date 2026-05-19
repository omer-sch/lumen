// Layer 4 (frontend component). File under test:
// src/components/dashboard/lifecycle/NetSubTrend.tsx
//
// The chart switches between line and bar variants based on the
// window length. Specifically, LINE_VS_BAR_THRESHOLD = 14: a 10-day
// window renders bars (data-mode="bar"), a 30-day window renders a
// line (data-mode="line"). Recharts itself doesn't mount cleanly in
// JSDOM without a sized parent, so we assert on the attribute the
// component exposes rather than introspecting the SVG.

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  NetSubTrend,
  LINE_VS_BAR_THRESHOLD,
} from "@/components/dashboard/lifecycle/NetSubTrend";
import type {
  LifecycleDailyRow,
  LifecycleNetSubPoint,
} from "@/lib/lifecycle/use-lifecycle-data";

function makeTrend(days: number): LifecycleNetSubPoint[] {
  return Array.from({ length: days }, (_, i) => ({
    date: `2026-05-${String(i + 1).padStart(2, "0")}`,
    netSub: 30 + i,
  }));
}

function makeDaily(days: number): LifecycleDailyRow[] {
  return Array.from({ length: days }, (_, i) => ({
    date: `2026-05-${String(i + 1).padStart(2, "0")}`,
    os: "iOS",
    subs: 40 + i,
    churn: 10 + (i % 3),
    netSub: 30 + i,
  }));
}

describe("NetSubTrend", () => {
  it("renders bars for windows shorter than the threshold", () => {
    const days = LINE_VS_BAR_THRESHOLD - 4; // 10
    render(
      <NetSubTrend trend={makeTrend(days)} daily={makeDaily(days)} />,
    );
    const chart = screen.getByTestId("lifecycle-net-sub-trend");
    expect(chart).toHaveAttribute("data-mode", "bar");
  });

  it("renders a line for windows at or above the threshold", () => {
    const days = LINE_VS_BAR_THRESHOLD + 16; // 30
    render(
      <NetSubTrend trend={makeTrend(days)} daily={makeDaily(days)} />,
    );
    const chart = screen.getByTestId("lifecycle-net-sub-trend");
    expect(chart).toHaveAttribute("data-mode", "line");
  });

  it("renders the empty state when the trend is empty", () => {
    render(<NetSubTrend trend={[]} daily={[]} />);
    expect(screen.getByTestId("lifecycle-net-sub-trend")).toBeInTheDocument();
    expect(
      screen.getByText(/No net-sub activity in this window/i),
    ).toBeInTheDocument();
  });
});
