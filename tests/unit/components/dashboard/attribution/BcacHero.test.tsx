// Layer 4 (frontend component). File under test:
// src/components/dashboard/attribution/BcacHero.tsx
//
// BcacHero wraps KpiCard in the hero variant with highlight on. We
// check the KpiCard renders with the right value formatting, the
// delta chip behavior matches direction=lower-better, and the "?"
// info button surfaces the BCAC formula via title.

import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BcacHero } from "@/components/dashboard/attribution/BcacHero";

describe("BcacHero", () => {
  it("renders the formatted BCAC value (after count-up settles)", async () => {
    render(<BcacHero bcac={42.78} delta={null} />);
    const card = screen.getByTestId("kpi-attribution-bcac");
    // Hero count-up duration is 1400ms; wait for it to settle.
    await waitFor(
      () => expect(card).toHaveTextContent("$42.78"),
      { timeout: 2500 },
    );
  });

  it("formats four-figure BCAC with thousands separator", async () => {
    render(<BcacHero bcac={1234} delta={null} />);
    const card = screen.getByTestId("kpi-attribution-bcac");
    await waitFor(
      () => expect(card).toHaveTextContent(/\$1,234/),
      { timeout: 2500 },
    );
  });

  it("renders the muted em-dash placeholder when BCAC is null", () => {
    render(<BcacHero bcac={null} delta={null} />);
    const card = screen.getByTestId("kpi-attribution-bcac");
    expect(card).toHaveTextContent("—");
  });

  it("uses lower-better direction: positive delta reads bad", () => {
    // BCAC rose vs prior period → bad signal (cost per sub increased).
    render(<BcacHero bcac={50} delta={12.5} />);
    expect(screen.getByTestId("kpi-attribution-bcac-delta")).toHaveAttribute(
      "data-signal",
      "bad",
    );
  });

  it("uses lower-better direction: negative delta reads good", () => {
    // BCAC fell vs prior period → good signal (efficiency improved).
    render(<BcacHero bcac={50} delta={-8.4} />);
    expect(screen.getByTestId("kpi-attribution-bcac-delta")).toHaveAttribute(
      "data-signal",
      "good",
    );
  });

  it("exposes the BCAC formula via the info icon tooltip", () => {
    render(<BcacHero bcac={42} delta={null} />);
    const info = screen.getByTestId("attribution-bcac-info");
    expect(info).toHaveAttribute(
      "title",
      expect.stringContaining("BCAC = total paid spend"),
    );
    expect(info).toHaveAttribute(
      "title",
      expect.stringContaining("same-length prior window"),
    );
  });
});
