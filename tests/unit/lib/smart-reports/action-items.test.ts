// @vitest-environment node
// Layer 2 (lib unit). File under test:
// src/lib/smart-reports/action-items.ts.

import { describe, expect, it } from "vitest";

import {
  actionItemsAsContextString,
  classifyActionLine,
  groupActionItemsByFamily,
  parseActionItems,
  splitNotesIntoLines,
} from "@/lib/smart-reports/action-items";
import type { ReadyData } from "@/lib/analyst/types";

function readyWithCampaigns(): ReadyData {
  return {
    intent: {
      client: "globalcomix",
      platforms: ["android"],
      channels: ["meta", "tiktok"],
      period: {
        label: "last 7 days",
        iso_start: "2026-05-01",
        iso_end: "2026-05-07",
      },
      focus: null,
      confidence: 1,
      doubts: [],
    },
    clientLabel: "GlobalComix",
    period: {
      label: "last 7 days",
      isoStart: "2026-05-01",
      isoEnd: "2026-05-07",
    },
    networks: [
      makeNetwork("Meta"),
      makeNetwork("TikTok"),
    ],
    campaigns: [
      makeCampaign({
        family: "Sub Evergreen",
        geo: "WW-Top",
        network: "Meta",
        campaign_name: "YH_FB_APP_FULL_IAP_Sub_Android_Evergreen_WW-Top",
      }),
      makeCampaign({
        family: "SubStart Seasonal",
        geo: "WW",
        network: "TikTok",
        campaign_name: "YH_TT_APP_FULL_IAP_SubStart_Android_Seasonal_WW",
      }),
      makeCampaign({
        family: "SubStart Evergreen",
        geo: "India",
        network: "Meta",
        campaign_name: "YH_FB_APP_FULL_IAP_SubStart_Android_Evergreen_India",
      }),
    ],
    trend: [],
    history: { networks: [] },
    anomalies: [],
    rankings: {
      topCampaignsBySpend: {
        rows: [],
        requestedN: 5,
        actualN: 0,
        partial: true,
      },
    },
    comparisons: { cpaD7PoP: [] },
    knowledgeChunks: [],
    provenance: {
      queryIds: ["network-breakdown", "campaigns"],
      cacheKey: "key",
      fetchedAt: "2026-05-16T12:00:00.000Z",
      bqCacheAgeSeconds: 0,
    },
  };
}

function makeNetwork(name: string) {
  return {
    network: name,
    spend: 1000,
    share: 0.3,
    installs: 100,
    clicks: 5000,
    impressions: 100000,
    cpi: 10,
    ctr: 0.05,
    cpm: 10,
    cpc: 0.2,
    roasD7: 0,
    roasD14: 0,
    roasD30: 0,
    roasD90: 0,
    ftdD7: 0,
    payersD7: 0,
    retD7: 0,
    subStart: 50,
    subD0: 10,
    subD7: 10,
    cpSubStart: 20,
    cpaD0: 100,
    cpaD7: 100,
    trailingCpaD7Avg: 95,
  };
}

function makeCampaign(over: {
  family: string;
  geo: string;
  network: string;
  campaign_name: string;
}) {
  return {
    campaign_id: over.campaign_name,
    campaign_name: over.campaign_name,
    network: over.network,
    spend: 500,
    installs: 50,
    cpi: 10,
    roi_d7: 0.3,
    spendDelta: 0.05,
    family: over.family,
    geo: over.geo,
    campaignType: "Evergreen",
    platform: "Android",
  };
}

describe("splitNotesIntoLines", () => {
  it("strips bullets and blank lines", () => {
    const notes = `
- We paused the WW Sub Seasonal campaign.
* Added fresh creatives.

1. Excluded low-performing geos.
`;
    expect(splitNotesIntoLines(notes)).toEqual([
      "We paused the WW Sub Seasonal campaign.",
      "Added fresh creatives.",
      "Excluded low-performing geos.",
    ]);
  });

  it("returns [] for empty / non-string input", () => {
    expect(splitNotesIntoLines("")).toEqual([]);
    expect(splitNotesIntoLines(null as unknown as string)).toEqual([]);
  });
});

describe("classifyActionLine", () => {
  const r = readyWithCampaigns();

  it("matches by family name (strongest signal)", () => {
    const out = classifyActionLine(
      "We added fresh creatives to Sub Evergreen this week.",
      r,
    );
    expect(out.family).toBe("Sub Evergreen");
    expect(out.networks).toContain("Meta");
  });

  it("matches by geo + network when no family is named", () => {
    const out = classifyActionLine(
      "Excluded low-performing geos on the Meta WW-Top.",
      r,
    );
    expect(out.family).toBe("Sub Evergreen");
    expect(out.networks).toContain("Meta");
  });

  it("matches by campaign_name (strongest signal of all)", () => {
    const out = classifyActionLine(
      "Adjusted the YH_TT_APP_FULL_IAP_SubStart_Android_Seasonal_WW campaign.",
      r,
    );
    expect(out.family).toBe("SubStart Seasonal");
    expect(out.networks).toContain("TikTok");
  });

  it("returns family=null when no family/geo/network is mentioned", () => {
    const out = classifyActionLine(
      "We had a great team retro today.",
      r,
    );
    expect(out.family).toBeNull();
    expect(out.networks).toEqual([]);
  });
});

describe("parseActionItems", () => {
  const r = readyWithCampaigns();

  it("returns [] for empty / null / undefined", () => {
    expect(parseActionItems(null, r)).toEqual([]);
    expect(parseActionItems(undefined, r)).toEqual([]);
    expect(parseActionItems("", r)).toEqual([]);
  });

  it("classifies each line and returns structured items", () => {
    const items = parseActionItems(
      "- Added fresh creatives to Sub Evergreen.\n- Paused SubStart Seasonal TikTok.",
      r,
    );
    expect(items).toHaveLength(2);
    expect(items[0].family).toBe("Sub Evergreen");
    expect(items[1].family).toBe("SubStart Seasonal");
  });
});

describe("groupActionItemsByFamily", () => {
  it("groups by family, ordered alphabetically with null last", () => {
    const groups = groupActionItemsByFamily([
      { text: "a", family: "Sub Evergreen", networks: [] },
      { text: "b", family: "SubStart Seasonal", networks: [] },
      { text: "c", family: null, networks: [] },
      { text: "d", family: "Sub Evergreen", networks: [] },
    ]);
    expect(groups.map((g) => g.family)).toEqual([
      "Sub Evergreen",
      "SubStart Seasonal",
      null,
    ]);
    expect(groups[0].items).toHaveLength(2);
  });
});

describe("actionItemsAsContextString", () => {
  it("returns empty string for empty input", () => {
    expect(actionItemsAsContextString([])).toBe("");
  });

  it("formats grouped items for the prompt context", () => {
    const s = actionItemsAsContextString([
      { text: "Added fresh creatives.", family: "Sub Evergreen", networks: [] },
      { text: "Paused campaign.", family: "SubStart Seasonal", networks: [] },
      { text: "Unrelated line.", family: null, networks: [] },
    ]);
    expect(s).toContain("Family: Sub Evergreen");
    expect(s).toContain("- Added fresh creatives.");
    expect(s).toContain("Family: SubStart Seasonal");
    expect(s).toContain("Family: Other / Unclassified");
  });
});
