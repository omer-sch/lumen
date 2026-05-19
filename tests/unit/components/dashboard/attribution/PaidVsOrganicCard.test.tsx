// Layer 4 (frontend component). File under test:
// src/components/dashboard/attribution/PaidVsOrganicCard.tsx
//
// Three sub-tiles render the counts; the share bar's paid/organic
// segments size proportional to the data. We assert on the inline
// width style so we know the bar reflects the split, regardless of
// whether the entry animation has resolved.

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PaidVsOrganicCard } from "@/components/dashboard/attribution/PaidVsOrganicCard";

describe("PaidVsOrganicCard", () => {
  it("renders three sub-tiles with the right counts", () => {
    render(
      <PaidVsOrganicCard
        data={{ subTotal: 1000, paid: 750, organic: 250 }}
      />,
    );

    expect(
      screen.getByTestId("attribution-paid-vs-organic"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("kpi-paid-vs-organic-sub-total")).toHaveTextContent(
      "1,000",
    );
    expect(screen.getByTestId("kpi-paid-vs-organic-sub-paid")).toHaveTextContent(
      "750",
    );
    expect(
      screen.getByTestId("kpi-paid-vs-organic-sub-organic"),
    ).toHaveTextContent("250");
  });

  it("share bar segments size proportional to paid / organic", () => {
    render(
      <PaidVsOrganicCard data={{ subTotal: 1000, paid: 750, organic: 250 }} />,
    );
    const paid = screen.getByTestId("attribution-paid-vs-organic-bar-paid");
    const organic = screen.getByTestId("attribution-paid-vs-organic-bar-organic");
    expect(paid).toHaveStyle({ width: "75%" });
    expect(organic).toHaveStyle({ width: "25%" });
  });

  it("renders 0% segments when there are no cohort subs", () => {
    render(
      <PaidVsOrganicCard data={{ subTotal: 0, paid: 0, organic: 0 }} />,
    );
    const paid = screen.getByTestId("attribution-paid-vs-organic-bar-paid");
    const organic = screen.getByTestId("attribution-paid-vs-organic-bar-organic");
    expect(paid).toHaveStyle({ width: "0%" });
    expect(organic).toHaveStyle({ width: "0%" });
  });

  it("renders the organic-halo caption (explains BCAC effect)", () => {
    render(
      <PaidVsOrganicCard data={{ subTotal: 1000, paid: 750, organic: 250 }} />,
    );
    expect(screen.getByText(/Organic halo lifts paid efficiency/i)).toBeInTheDocument();
  });
});
