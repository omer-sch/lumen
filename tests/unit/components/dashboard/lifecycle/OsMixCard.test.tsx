// Layer 4 (frontend component). File under test:
// src/components/dashboard/lifecycle/OsMixCard.tsx
//
// Confirms the legend row renders one entry per OS, the center label
// shows the total, and the empty state surfaces when there are no
// rows.

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { OsMixCard } from "@/components/dashboard/lifecycle/OsMixCard";

describe("OsMixCard", () => {
  it("renders one legend row per OS with the percent share", () => {
    render(
      <OsMixCard
        osMix={[
          { os: "iOS", subs: 600, share: 0.6 },
          { os: "Android", subs: 300, share: 0.3 },
          { os: "Web", subs: 100, share: 0.1 },
        ]}
      />,
    );

    expect(screen.getByTestId("lifecycle-os-mix")).toBeInTheDocument();
    expect(screen.getByTestId("lifecycle-os-mix-row-ios")).toBeInTheDocument();
    expect(
      screen.getByTestId("lifecycle-os-mix-row-android"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("lifecycle-os-mix-row-web")).toBeInTheDocument();

    // 60% / 30% / 10% legend percents are present in the DOM.
    expect(screen.getByText("60.0%")).toBeInTheDocument();
    expect(screen.getByText("30.0%")).toBeInTheDocument();
    expect(screen.getByText("10.0%")).toBeInTheDocument();
  });

  it("shows the total subs in the donut center label", () => {
    render(
      <OsMixCard
        osMix={[
          { os: "iOS", subs: 1234, share: 0.5 },
          { os: "Android", subs: 1234, share: 0.5 },
        ]}
      />,
    );
    // Total = 2468 — rendered as "2,468" in the center label.
    expect(screen.getByText(/^2,468$/)).toBeInTheDocument();
  });

  it("renders the empty state when total is zero", () => {
    render(<OsMixCard osMix={[]} />);
    expect(screen.getByText(/No OS mix for this window/i)).toBeInTheDocument();
  });
});
