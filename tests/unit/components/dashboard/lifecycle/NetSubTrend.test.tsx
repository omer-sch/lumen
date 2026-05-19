// Layer 4 (frontend component). File under test:
// src/components/dashboard/lifecycle/NetSubTrend.tsx
//
// The chart always renders as bars regardless of window length. Recharts
// itself doesn't mount cleanly in JSDOM without a sized parent, so we
// assert on the data-mode attribute the component exposes rather than
// introspecting the SVG.

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { NetSubTrend } from "@/components/dashboard/lifecycle/NetSubTrend";
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
  it("renders bars for a short window", () => {
    render(<NetSubTrend trend={makeTrend(10)} daily={makeDaily(10)} />);
    const chart = screen.getByTestId("lifecycle-net-sub-trend");
    expect(chart).toHaveAttribute("data-mode", "bar");
  });

  it("renders bars for a long window (no line-mode crossover)", () => {
    render(<NetSubTrend trend={makeTrend(30)} daily={makeDaily(30)} />);
    const chart = screen.getByTestId("lifecycle-net-sub-trend");
    expect(chart).toHaveAttribute("data-mode", "bar");
  });

  it("renders the empty state when the trend is empty", () => {
    render(<NetSubTrend trend={[]} daily={[]} />);
    expect(screen.getByTestId("lifecycle-net-sub-trend")).toBeInTheDocument();
    expect(
      screen.getByText(/No net-sub activity in this window/i),
    ).toBeInTheDocument();
  });
});
