// Layer 4 (frontend component). File under test:
// src/components/dashboard/attribution/PaidVsOrganicCard.tsx
//
// Redesigned around a pie chart: donut on the left, three stat rows on
// the right. The donut itself is a recharts <PieChart> which doesn't
// render readable text in JSDOM, so we assert on (a) the wrapper exists,
// (b) the three stat rows render the right counts, (c) the center label
// shows the total, and (d) the caption explains the BCAC effect.

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PaidVsOrganicCard } from "@/components/dashboard/attribution/PaidVsOrganicCard";

describe("PaidVsOrganicCard", () => {
  it("mounts the donut wrapper and the three stat rows", () => {
    render(
      <PaidVsOrganicCard
        data={{ subTotal: 1000, paid: 750, organic: 250 }}
      />,
    );
    expect(
      screen.getByTestId("attribution-paid-vs-organic"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("attribution-paid-vs-organic-donut"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("kpi-paid-vs-organic-sub-total"),
    ).toHaveTextContent("1,000");
    expect(screen.getByTestId("kpi-paid-vs-organic-sub-paid")).toHaveTextContent(
      "750",
    );
    expect(
      screen.getByTestId("kpi-paid-vs-organic-sub-organic"),
    ).toHaveTextContent("250");
  });

  it("renders the percentage share next to Sub Paid and Sub Organic", () => {
    render(
      <PaidVsOrganicCard data={{ subTotal: 1000, paid: 750, organic: 250 }} />,
    );
    expect(
      within(screen.getByTestId("kpi-paid-vs-organic-sub-paid")).getByText(
        "75.0%",
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId("kpi-paid-vs-organic-sub-organic")).getByText(
        "25.0%",
      ),
    ).toBeInTheDocument();
  });

  it("shows the cohort total in the donut center label", () => {
    render(
      <PaidVsOrganicCard data={{ subTotal: 1234, paid: 1000, organic: 234 }} />,
    );
    const donut = screen.getByTestId("attribution-paid-vs-organic-donut");
    expect(within(donut).getByText("1,234")).toBeInTheDocument();
    expect(within(donut).getByText(/^Subs$/i)).toBeInTheDocument();
  });

  it("renders the donut for an empty window without crashing", () => {
    // hasData=false path: the donut becomes a single gray ring, total
    // reads 0, the stat rows all render 0.
    render(<PaidVsOrganicCard data={{ subTotal: 0, paid: 0, organic: 0 }} />);
    expect(
      screen.getByTestId("attribution-paid-vs-organic-donut"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("kpi-paid-vs-organic-sub-total"),
    ).toHaveTextContent("0");
  });

  it("renders the organic-halo caption (explains BCAC effect)", () => {
    render(
      <PaidVsOrganicCard data={{ subTotal: 1000, paid: 750, organic: 250 }} />,
    );
    expect(screen.getByText(/Organic halo lifts paid efficiency/i)).toBeInTheDocument();
  });
});
