// Layer 2 (frontend lib unit). Component under test:
// src/components/campaigns/CampaignsTable.tsx. Priority: P2.
//
// Index-page chip filters + show-more toggle are local React state, so
// the right test surface is a render-and-assert sweep. We feed real-shape
// CampaignRow fixtures through enrichment and verify visible row counts,
// chip-toggle filtering, and column visibility.

import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CampaignsTable } from "@/components/campaigns/CampaignsTable";
import type { CampaignRow } from "@/types/dashboard";

const row = (
  id: string,
  name: string,
  network: string,
  overrides: Partial<CampaignRow> = {},
): CampaignRow => ({
  campaign_id: id,
  campaign_name: name,
  network,
  campaign_status: null,
  spend: 1000,
  installs: 100,
  cpi: 10,
  roi_d7: 1.2,
  spendDelta: 0.05,
  ...overrides,
});

const FIXTURE: CampaignRow[] = [
  row("c1", "YH_FB_APP_FULL_IAP_Sub_iOS_Evergreen_WW", "Meta", {
    campaign_status: "running",
  }),
  row("c2", "YH_FB_APP_FULL_IAP_SubStart_iOS_Evergreen_US", "Meta", {
    campaign_status: "running",
  }),
  row("c3", "YH_GG_APP_FULL_ALL_IAP_Sub_Android_Seasonal_WW-Top", "Google Ads", {
    campaign_status: "paused",
  }),
  row("c4", "YH_TT_APP_FULL_Sub_Android_Evergreen_WW-Top", "TikTok"),
  row("c5", "legacy_handname", "AppLovin", {
    campaign_status: "running",
    sub_d7: 25,
    sub_start_d7: 30,
    cpa_d7: 40,
  }),
];

describe("CampaignsTable - WS2 enrichment + chip filters", () => {
  it("renders one row per fixture campaign by default", () => {
    render(<CampaignsTable rows={FIXTURE} />);
    const table = screen.getByTestId("campaigns-table");
    expect(within(table).getAllByRole("row").length).toBe(FIXTURE.length + 1); // +header
  });

  it("Status=Running filters to only running campaigns", async () => {
    const user = userEvent.setup();
    render(<CampaignsTable rows={FIXTURE} />);
    await user.click(screen.getByTestId("campaigns-status-running"));
    const table = screen.getByTestId("campaigns-table");
    // c1, c2, c5 are running.
    expect(within(table).getByTestId("campaign-row-c1")).toBeTruthy();
    expect(within(table).getByTestId("campaign-row-c2")).toBeTruthy();
    expect(within(table).getByTestId("campaign-row-c5")).toBeTruthy();
    expect(within(table).queryByTestId("campaign-row-c3")).toBeNull();
    expect(within(table).queryByTestId("campaign-row-c4")).toBeNull();
  });

  it("Status=Paused filters to only paused campaigns", async () => {
    const user = userEvent.setup();
    render(<CampaignsTable rows={FIXTURE} />);
    await user.click(screen.getByTestId("campaigns-status-paused"));
    const table = screen.getByTestId("campaigns-table");
    expect(within(table).getByTestId("campaign-row-c3")).toBeTruthy();
    expect(within(table).queryByTestId("campaign-row-c1")).toBeNull();
  });

  it("network=Meta filters to only Meta campaigns", async () => {
    const user = userEvent.setup();
    render(<CampaignsTable rows={FIXTURE} />);
    await user.click(screen.getByTestId("campaigns-channel-Meta"));
    const table = screen.getByTestId("campaigns-table");
    expect(within(table).getByTestId("campaign-row-c1")).toBeTruthy();
    expect(within(table).getByTestId("campaign-row-c2")).toBeTruthy();
    expect(within(table).queryByTestId("campaign-row-c3")).toBeNull();
    expect(within(table).queryByTestId("campaign-row-c4")).toBeNull();
  });

  it("More toggle reveals Sub Start D7 / Sub D7 columns", async () => {
    const user = userEvent.setup();
    render(<CampaignsTable rows={FIXTURE} />);
    // Default: extended columns hidden.
    expect(screen.queryByTestId("sort-sub_start_d7")).toBeNull();
    expect(screen.queryByTestId("sort-sub_d7")).toBeNull();
    await user.click(screen.getByTestId("campaigns-show-more"));
    expect(screen.getByTestId("sort-sub_start_d7")).toBeTruthy();
    expect(screen.getByTestId("sort-sub_d7")).toBeTruthy();
  });

  it("running campaign renders a status-running indicator; paused renders the muted dot", () => {
    render(<CampaignsTable rows={FIXTURE} />);
    const c1 = screen.getByTestId("campaign-row-c1");
    expect(within(c1).getByTestId("status-running")).toBeTruthy();
    const c3 = screen.getByTestId("campaign-row-c3");
    expect(within(c3).getByTestId("status-paused")).toBeTruthy();
    // c4 has null status — neither indicator renders.
    const c4 = screen.getByTestId("campaign-row-c4");
    expect(within(c4).queryByTestId("status-running")).toBeNull();
    expect(within(c4).queryByTestId("status-paused")).toBeNull();
  });

  it("empty rows array renders the no-match empty state", () => {
    render(<CampaignsTable rows={[]} />);
    expect(
      screen.getByText(/No campaigns match this filter/i),
    ).toBeTruthy();
  });
});
