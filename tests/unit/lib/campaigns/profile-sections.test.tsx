// Layer 2 (component unit). Files under test:
//   src/components/campaigns/profile/{AdsetBreakdown,CreativeBreakdown,
//     GeoBreakdown,CoverageWarning}.tsx
// PeerComparison is exercised separately because it pulls in
// useCampaignsData (network-bound).
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AdsetBreakdown } from "@/components/campaigns/profile/AdsetBreakdown";
import { CreativeBreakdown } from "@/components/campaigns/profile/CreativeBreakdown";
import { GeoBreakdown } from "@/components/campaigns/profile/GeoBreakdown";
import { CoverageWarning } from "@/components/campaigns/profile/CoverageWarning";
import type {
  AdsetRow,
  CampaignSummary,
  ProfileCreativeRow,
  ProfileGeoRow,
} from "@/types/dashboard";

// ── AdsetBreakdown ─────────────────────────────────────────────────────────

const adsetRow = (overrides: Partial<AdsetRow> = {}): AdsetRow => ({
  adset_name: "adset_evergreen_us",
  network: "Meta",
  spend: 0,
  installs: 0,
  cpi: 0,
  cpa_d7: null,
  roi_d7: 1.2,
  sub_d7: 50,
  ...overrides,
});

describe("AdsetBreakdown", () => {
  it("renders one row per adset with sub_d7 / roi_d7", () => {
    render(
      <AdsetBreakdown
        adsets={[
          adsetRow({ adset_name: "us_adset_a", sub_d7: 100, roi_d7: 1.5 }),
          adsetRow({ adset_name: "us_adset_b", sub_d7: 60, roi_d7: 0.9 }),
        ]}
      />,
    );
    const table = screen.getByTestId("profile-adsets-table");
    expect(within(table).getAllByRole("row").length).toBe(3); // header + 2
    expect(within(table).getByText("us_adset_a")).toBeTruthy();
  });

  it("sub_d7 sort descending by default", () => {
    render(
      <AdsetBreakdown
        adsets={[
          adsetRow({ adset_name: "small", sub_d7: 10 }),
          adsetRow({ adset_name: "big", sub_d7: 999 }),
        ]}
      />,
    );
    const rows = screen.getAllByTestId(/^adset-row-/);
    expect(rows[0]).toHaveTextContent("big");
    expect(rows[1]).toHaveTextContent("small");
  });

  it("toggling a sortable column flips direction", async () => {
    const user = userEvent.setup();
    render(
      <AdsetBreakdown
        adsets={[
          adsetRow({ adset_name: "z", sub_d7: 1 }),
          adsetRow({ adset_name: "a", sub_d7: 1 }),
        ]}
      />,
    );
    await user.click(screen.getByTestId("profile-adsets-sort-adset_name"));
    const rows = screen.getAllByTestId(/^adset-row-/);
    expect(rows[0]).toHaveTextContent("a");
    expect(rows[1]).toHaveTextContent("z");
  });

  it("empty array renders the empty-state copy", () => {
    render(<AdsetBreakdown adsets={[]} />);
    expect(screen.getByText(/No adset attribution/i)).toBeTruthy();
  });
});

// ── CreativeBreakdown ──────────────────────────────────────────────────────

const creativeRow = (
  overrides: Partial<ProfileCreativeRow> = {},
): ProfileCreativeRow => ({
  ad_id: "ad-1",
  ad_name: "Creative A · 9x16",
  creative_name: "Creative A",
  network: "Meta",
  thumbnail_url: null,
  spend: 0,
  installs: 0,
  sub_start_d7: 10,
  sub_d7: 5,
  cpa_d7: 0,
  roi_d7: 1.1,
  ...overrides,
});

describe("CreativeBreakdown", () => {
  it("renders one row per creative", () => {
    render(
      <CreativeBreakdown
        creatives={[creativeRow({ ad_id: "ad-1" }), creativeRow({ ad_id: "ad-2" })]}
      />,
    );
    expect(screen.getByTestId("creative-row-ad-1")).toBeTruthy();
    expect(screen.getByTestId("creative-row-ad-2")).toBeTruthy();
  });

  it("renders a network initials placeholder when no thumbnail", () => {
    render(
      <CreativeBreakdown
        creatives={[creativeRow({ network: "Google Ads", thumbnail_url: null })]}
      />,
    );
    expect(screen.getByText("GO")).toBeTruthy();
  });

  it("empty array renders the empty-state copy", () => {
    render(<CreativeBreakdown creatives={[]} />);
    expect(screen.getByText(/No creative-level attribution/i)).toBeTruthy();
  });
});

// ── GeoBreakdown ───────────────────────────────────────────────────────────

const geoRow = (
  overrides: Partial<ProfileGeoRow> = {},
): ProfileGeoRow => ({
  country_code: "US",
  country_name: "United States",
  spend: 0,
  installs: 0,
  sub_d7: 100,
  rev_d7: 500,
  cpa_d7: 0,
  roi_d7: 0,
  sub_paid: 100,
  sub_organic: 0,
  ...overrides,
});

describe("GeoBreakdown", () => {
  it("renders top countries sorted by sub_d7 desc", () => {
    render(
      <GeoBreakdown
        geo={[
          geoRow({ country_code: "DE", country_name: "Germany", sub_d7: 200 }),
          geoRow({ country_code: "US", country_name: "United States", sub_d7: 300 }),
        ]}
      />,
    );
    const rows = screen.getAllByTestId(/^geo-row-(?!rest)/);
    expect(rows[0]).toHaveTextContent("United States");
    expect(rows[1]).toHaveTextContent("Germany");
  });

  it("rolls overflow rows into a 'Rest' aggregate", () => {
    const many = Array.from({ length: 14 }, (_, i) =>
      geoRow({
        country_code: `C${i}`,
        country_name: `Country ${i}`,
        sub_d7: 100 - i,
      }),
    );
    render(<GeoBreakdown geo={many} />);
    const rest = screen.getByTestId("geo-row-rest");
    // Rest aggregates ranks 11..14 → sub_d7 90 + 89 + 88 + 87 = 354.
    expect(rest).toHaveTextContent("354");
  });

  it("empty array renders the empty-state copy", () => {
    render(<GeoBreakdown geo={[]} />);
    expect(screen.getByText(/No country attribution/i)).toBeTruthy();
  });
});

// ── CoverageWarning ────────────────────────────────────────────────────────

const summary = (overrides: Partial<CampaignSummary> = {}): CampaignSummary => ({
  campaign_id: "1",
  campaign_name: "test",
  network: "Meta",
  campaign_status: "running",
  family: "Sub Evergreen",
  geo: "WW",
  campaignType: "Evergreen",
  platform: "iOS",
  spend: 1,
  installs: 1,
  cpi: 1,
  cpa_d7: null,
  roi_d7: 0,
  sub_start_d7: null,
  sub_d7: null,
  spendDelta: null,
  installsDelta: null,
  cpiDelta: null,
  cpaD7Delta: null,
  roiD7Delta: null,
  ...overrides,
});

describe("CoverageWarning", () => {
  it("renders the AppLovin coverage callout when window starts before 2026-05-05", () => {
    const from = new Date(Date.UTC(2026, 4, 1));
    render(<CoverageWarning summary={summary({ network: "AppLovin" })} from={from} />);
    expect(screen.getByTestId("profile-coverage-applovin")).toBeTruthy();
  });

  it("hides the AppLovin callout when window starts at or after 2026-05-05", () => {
    const from = new Date(Date.UTC(2026, 4, 5));
    render(<CoverageWarning summary={summary({ network: "AppLovin" })} from={from} />);
    expect(screen.queryByTestId("profile-coverage-applovin")).toBeNull();
  });

  it("does not render for non-AppLovin networks even in the pre-coverage window", () => {
    const from = new Date(Date.UTC(2026, 4, 1));
    render(<CoverageWarning summary={summary({ network: "Meta" })} from={from} />);
    expect(screen.queryByTestId("profile-coverage-applovin")).toBeNull();
  });
});
