// Layer 4 (frontend component). File under test:
// src/components/dashboard/lifecycle/LifecycleKpiStrip.tsx
//
// Three KpiCards render with the totals/deltas/sparklines the hook
// produces. Highlight tile is Net Sub. Cancellations uses lower-better
// so a positive delta reads coral (the inversion KpiCard already owns —
// we just confirm the prop is wired correctly).

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LifecycleKpiStrip } from "@/components/dashboard/lifecycle/LifecycleKpiStrip";

const baseTotals = { subs: 1234, churn: 56, netSub: 1178 };
const baseDeltas = { subs: 12.4, churn: -8.2, netSub: 14.6 };
const baseSparklines = {
  subs: [
    { date: "2026-05-15", value: 410 },
    { date: "2026-05-16", value: 420 },
    { date: "2026-05-17", value: 404 },
  ],
  churn: [
    { date: "2026-05-15", value: 18 },
    { date: "2026-05-16", value: 19 },
    { date: "2026-05-17", value: 19 },
  ],
  netSub: [
    { date: "2026-05-15", value: 392 },
    { date: "2026-05-16", value: 401 },
    { date: "2026-05-17", value: 385 },
  ],
};

describe("LifecycleKpiStrip", () => {
  it("renders three KpiCards with the right labels and counts", () => {
    render(
      <LifecycleKpiStrip
        totals={baseTotals}
        deltas={baseDeltas}
        sparklines={baseSparklines}
      />,
    );

    expect(screen.getByTestId("lifecycle-kpi-strip")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-lifecycle-new-subs")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-lifecycle-cancellations")).toBeInTheDocument();
    expect(screen.getByTestId("kpi-lifecycle-net-sub")).toBeInTheDocument();

    // Labels are rendered as the small uppercase label inside each card.
    expect(screen.getByText(/New subscribers/i)).toBeInTheDocument();
    expect(screen.getByText(/Cancellations/i)).toBeInTheDocument();
    expect(screen.getByText(/Net Sub/i)).toBeInTheDocument();
  });

  it("renders the delta chip with sign-correct UI per direction", () => {
    render(
      <LifecycleKpiStrip
        totals={baseTotals}
        deltas={baseDeltas}
        sparklines={baseSparklines}
      />,
    );

    // KpiCard applies data-signal="good" when direction/delta agree.
    // New subs: direction=higher-better, delta positive → good.
    expect(screen.getByTestId("kpi-lifecycle-new-subs-delta")).toHaveAttribute(
      "data-signal",
      "good",
    );
    // Cancellations: direction=lower-better, delta negative → good
    // (cancellations went down, that's a win).
    expect(
      screen.getByTestId("kpi-lifecycle-cancellations-delta"),
    ).toHaveAttribute("data-signal", "good");
    // Net Sub: direction=higher-better, delta positive → good.
    expect(screen.getByTestId("kpi-lifecycle-net-sub-delta")).toHaveAttribute(
      "data-signal",
      "good",
    );
  });

  it("renders a muted em-dash chip when delta is null", () => {
    render(
      <LifecycleKpiStrip
        totals={baseTotals}
        deltas={{ subs: null, churn: null, netSub: null }}
        sparklines={baseSparklines}
      />,
    );
    for (const id of [
      "lifecycle-new-subs",
      "lifecycle-cancellations",
      "lifecycle-net-sub",
    ]) {
      const chip = screen.getByTestId(`kpi-${id}-delta`);
      expect(chip).toHaveAttribute("data-signal", "neutral");
      expect(chip).toHaveTextContent(/—/);
    }
  });
});
