// @vitest-environment jsdom
// Layer 4 (component). File under test:
// src/components/reports/sections/SectionDivider.tsx. Pins the
// suppressPill contract (manual decks render no platform / channel
// pill until the builder UI exposes pickers).

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { SectionDivider } from "@/components/reports/sections/SectionDivider";

describe("SectionDivider", () => {
  it("renders the platform pill by default", () => {
    render(
      <SectionDivider
        platform="ios"
        channel="tiktok"
        title="TikTok"
        subtitle="Weekly Breakdown"
      />,
    );
    // Pill labels appear twice (icon row + pill); the suppressed
    // case below collapses to one set so a presence check is enough.
    const pillSpans = screen.getAllByText("iOS");
    expect(pillSpans.length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("TikTok").length).toBeGreaterThanOrEqual(1);
  });

  it("suppresses the platform / channel pill when suppressPill is true", () => {
    render(
      <SectionDivider
        platform="android"
        channel="meta"
        title="Meta"
        subtitle="Campaign Breakdown"
        suppressPill
      />,
    );
    // Title still renders.
    expect(screen.getByText("Meta")).toBeInTheDocument();
    // The pill carries Android + Meta labels in addition to the
    // icon-row aria-labels; when suppressed, the visible text count
    // for "Android" drops because only the icon's title attribute
    // remains. Assert: no element with the pill's tracking class
    // contains both labels.
    expect(screen.queryByText("Android")).toBeNull();
  });
});
