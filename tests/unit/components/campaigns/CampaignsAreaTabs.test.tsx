// Layer 4 (frontend component). File under test:
// src/components/campaigns/CampaignsAreaTabs.tsx
//
// The tab strip groups the three Campaigns-area drill-down lenses
// (Campaigns / Creatives / Geo) under one nav slot. We mock
// next/navigation so the component renders without needing a router,
// and assert on aria-selected, hrefs, and keyboard focus chain.

import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams("range=7d&client=globalcomix"),
}));

import { CampaignsAreaTabs } from "@/components/campaigns/CampaignsAreaTabs";

describe("CampaignsAreaTabs", () => {
  it("marks the active tab with aria-selected and the others as inactive", () => {
    render(<CampaignsAreaTabs activeTab="creatives" />);
    expect(
      screen.getByTestId("campaigns-area-tab-campaigns"),
    ).toHaveAttribute("aria-selected", "false");
    expect(
      screen.getByTestId("campaigns-area-tab-creatives"),
    ).toHaveAttribute("aria-selected", "true");
    expect(screen.getByTestId("campaigns-area-tab-geo")).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });

  it("renders each tab as a Link to the matching route segment", () => {
    render(<CampaignsAreaTabs activeTab="campaigns" />);
    expect(
      screen.getByTestId("campaigns-area-tab-campaigns").getAttribute("href"),
    ).toMatch(/^\/campaigns\?/);
    expect(
      screen.getByTestId("campaigns-area-tab-creatives").getAttribute("href"),
    ).toMatch(/^\/campaigns\/creatives\?/);
    expect(
      screen.getByTestId("campaigns-area-tab-geo").getAttribute("href"),
    ).toMatch(/^\/campaigns\/geo\?/);
  });

  it("threads the active query string through every tab", () => {
    render(<CampaignsAreaTabs activeTab="campaigns" />);
    for (const t of ["campaigns", "creatives", "geo"]) {
      const href = screen
        .getByTestId(`campaigns-area-tab-${t}`)
        .getAttribute("href");
      expect(href).toContain("range=7d");
      expect(href).toContain("client=globalcomix");
    }
  });

  it("sets role=tablist on the container with a labelled-by name", () => {
    render(<CampaignsAreaTabs activeTab="campaigns" />);
    const list = screen.getByTestId("campaigns-area-tabs");
    expect(list).toHaveAttribute("role", "tablist");
    expect(list).toHaveAttribute("aria-label", "Campaigns drill-down lens");
  });

  it("only the active tab is in the natural tab order; others are roving (tabIndex=-1)", () => {
    render(<CampaignsAreaTabs activeTab="geo" />);
    expect(
      screen.getByTestId("campaigns-area-tab-campaigns"),
    ).toHaveAttribute("tabindex", "-1");
    expect(
      screen.getByTestId("campaigns-area-tab-creatives"),
    ).toHaveAttribute("tabindex", "-1");
    expect(screen.getByTestId("campaigns-area-tab-geo")).toHaveAttribute(
      "tabindex",
      "0",
    );
  });

  it("ArrowRight / ArrowLeft on the active tab move focus to the neighbor", async () => {
    render(<CampaignsAreaTabs activeTab="campaigns" />);
    const campaigns = screen.getByTestId("campaigns-area-tab-campaigns");
    const creatives = screen.getByTestId("campaigns-area-tab-creatives");
    const geo = screen.getByTestId("campaigns-area-tab-geo");

    campaigns.focus();
    fireEvent.keyDown(campaigns, { key: "ArrowRight" });
    // Focus chain hops via requestAnimationFrame so the DOM commits
    // first; flush a frame before asserting.
    await flushRaf();
    expect(document.activeElement).toBe(creatives);

    fireEvent.keyDown(creatives, { key: "ArrowLeft" });
    await flushRaf();
    expect(document.activeElement).toBe(campaigns);

    // Wrap: ArrowLeft from the leftmost tab focuses the rightmost.
    fireEvent.keyDown(campaigns, { key: "ArrowLeft" });
    await flushRaf();
    expect(document.activeElement).toBe(geo);
  });

  it("ignores non-arrow keys", () => {
    render(<CampaignsAreaTabs activeTab="campaigns" />);
    const campaigns = screen.getByTestId("campaigns-area-tab-campaigns");
    campaigns.focus();
    fireEvent.keyDown(campaigns, { key: "Tab" });
    expect(document.activeElement).toBe(campaigns);
  });
});

function flushRaf() {
  return new Promise<void>((resolve) =>
    requestAnimationFrame(() => resolve()),
  );
}
