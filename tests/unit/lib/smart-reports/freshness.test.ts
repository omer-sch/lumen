// @vitest-environment node
// Layer 2 (lib unit). File under test: src/lib/smart-reports/freshness.ts.

import { describe, expect, it } from "vitest";

import {
  freshnessAsContextString,
  summarizeFreshness,
} from "@/lib/smart-reports/freshness";
import type { ReadyData } from "@/lib/analyst/types";

function ready(over: Partial<ReadyData> = {}): ReadyData {
  return {
    intent: {
      client: "globalcomix",
      platforms: ["android"],
      channels: ["meta"],
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
    networks: [],
    campaigns: [],
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
    ...over,
  };
}

function networkRow(over: Partial<ReadyData["networks"][number]> = {}) {
  return {
    network: "Google",
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
    subD0: 0,
    subD7: 0,
    cpSubStart: 20,
    cpaD0: 0,
    cpaD7: 0,
    trailingCpaD7Avg: 30,
    ...over,
  };
}

describe("summarizeFreshness", () => {
  it("emits no caveats when data is fresh and every network has cohort hits", () => {
    const r = ready({
      provenance: {
        ...ready().provenance,
        bqCacheAgeSeconds: 60 * 60 * 4, // 4 hours
      },
      networks: [networkRow({ subD0: 10, subD7: 8, payersD7: 8 })],
    });
    expect(summarizeFreshness(r)).toEqual({ caveats: [], hasIssues: false });
  });

  it("emits a warehouse-stale caveat past the 24-hour threshold", () => {
    const r = ready({
      provenance: {
        ...ready().provenance,
        bqCacheAgeSeconds: 60 * 60 * 36, // 36 hours
      },
    });
    const s = summarizeFreshness(r);
    expect(s.hasIssues).toBe(true);
    expect(s.caveats).toHaveLength(1);
    expect(s.caveats[0].subject).toBe("warehouse");
    // 36 hours doesn't quite hit the "2+ days" pluralization path,
    // so we expect the hours-form. Tweaking the threshold would just
    // be cosmetic.
    expect(s.caveats[0].message).toMatch(/36 hours behind/);
  });

  it("emits per-network caveats for sparse cohort attribution", () => {
    const r = ready({
      networks: [
        networkRow({ network: "Google", spend: 1500, subD0: 0, subD7: 0, payersD7: 0 }),
        networkRow({ network: "Meta", spend: 2000, subD0: 20, subD7: 15, payersD7: 15 }),
      ],
    });
    const s = summarizeFreshness(r);
    expect(s.caveats.map((c) => c.subject)).toEqual(["Google"]);
    expect(s.caveats[0].message).toMatch(/Google results are still incomplete/);
  });

  it("ignores tiny-spend networks (under the spend threshold)", () => {
    const r = ready({
      networks: [
        networkRow({ network: "AppLovin", spend: 10, subD0: 0, subD7: 0, payersD7: 0 }),
      ],
    });
    expect(summarizeFreshness(r).caveats).toEqual([]);
  });

  it("orders per-network caveats by spend descending", () => {
    const r = ready({
      networks: [
        networkRow({ network: "TikTok", spend: 300, subD0: 0, subD7: 0, payersD7: 0 }),
        networkRow({ network: "Google", spend: 1500, subD0: 0, subD7: 0, payersD7: 0 }),
        networkRow({ network: "Meta", spend: 800, subD0: 0, subD7: 0, payersD7: 0 }),
      ],
    });
    const s = summarizeFreshness(r);
    expect(s.caveats.map((c) => c.subject)).toEqual(["Google", "Meta", "TikTok"]);
  });
});

describe("freshnessAsContextString", () => {
  it("returns the empty string when no caveats fired", () => {
    expect(freshnessAsContextString({ caveats: [], hasIssues: false })).toBe("");
  });

  it("formats caveats as a bulleted list", () => {
    const s = freshnessAsContextString({
      caveats: [
        { subject: "Google", message: "Google results are still incomplete." },
        { subject: "Meta", message: "Meta results are still incomplete." },
      ],
      hasIssues: true,
    });
    expect(s).toContain("- Google results are still incomplete.");
    expect(s).toContain("- Meta results are still incomplete.");
  });
});
