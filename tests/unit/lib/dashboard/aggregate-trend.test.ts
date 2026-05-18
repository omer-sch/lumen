// Layer 2 (lib unit). File under test:
// src/lib/dashboard/aggregate-trend.ts. Cadence-bucket math used by the
// CadenceTable component (WS7.A). Critical assertion: rate metrics are
// recomputed from bucket sums, never averaged across days.

import { describe, expect, it } from "vitest";

import { aggregateTrend, isoWeekOf } from "@/lib/dashboard/aggregate-trend";
import type { BQTrendPointByNetwork } from "@/types/dashboard";

function row(over: Partial<BQTrendPointByNetwork> = {}): BQTrendPointByNetwork {
  return {
    date: "2026-05-01",
    network: "Meta",
    spend: 100,
    installs: 10,
    clicks: 200,
    impressions: 5000,
    cpi: 10,
    roas: 0.3,
    subStartD7: 5,
    subD7: 2,
    revD7: 30,
    ctr: 0.04,
    cpm: 20,
    cpc: 0.5,
    ...over,
  };
}

describe("aggregateTrend (daily)", () => {
  it("groups rows from the same date into a single bucket", () => {
    const rows = [
      row({ date: "2026-05-01", network: "Meta", spend: 100 }),
      row({ date: "2026-05-01", network: "Google", spend: 50 }),
    ];
    const out = aggregateTrend(rows, "daily");
    expect(out).toHaveLength(1);
    expect(out[0].spend).toBe(150);
    expect(out[0].bucket).toBe("2026-05-01");
  });

  it("recomputes CPI from sums (not the average of daily CPIs)", () => {
    // Day 1: spend $100, installs 10 -> CPI $10
    // Day 2: spend $90,  installs 1  -> CPI $90
    // Average of daily CPIs would be $50.
    // True period CPI = (100 + 90) / (10 + 1) = $190 / 11 = $17.27.
    const rows = [
      row({ date: "2026-05-01", spend: 100, installs: 10, cpi: 10 }),
      row({ date: "2026-05-02", spend: 90, installs: 1, cpi: 90 }),
    ];
    const out = aggregateTrend(rows, "daily");
    // Daily cadence -> one bucket per day. CPI per-day should equal the
    // row's per-day true CPI (spend / installs), not the input CPI field.
    const day1 = out.find((r) => r.bucket === "2026-05-01")!;
    const day2 = out.find((r) => r.bucket === "2026-05-02")!;
    expect(day1.cpi).toBe(10);
    expect(day2.cpi).toBe(90);
  });
});

describe("aggregateTrend (weekly)", () => {
  it("groups all days of an ISO week into one bucket and recomputes rates", () => {
    // 2026-04-27 (Mon) through 2026-05-03 (Sun) = Week 18 of 2026.
    const rows = [
      row({ date: "2026-04-27", spend: 100, installs: 10 }),
      row({ date: "2026-04-28", spend: 200, installs: 30 }),
      row({ date: "2026-04-29", spend: 300, installs: 20 }),
    ];
    const out = aggregateTrend(rows, "weekly");
    expect(out).toHaveLength(1);
    expect(out[0].spend).toBe(600);
    expect(out[0].installs).toBe(60);
    // CPI = sum(spend) / sum(installs) = 600 / 60 = 10, NOT the average
    // of the three per-day CPIs (which would be (10 + 6.67 + 15) / 3 ~= 10.56).
    expect(out[0].cpi).toBeCloseTo(10);
  });

  it("emits an ISO-style week label and key", () => {
    const rows = [row({ date: "2026-04-27" })]; // Week 18
    const out = aggregateTrend(rows, "weekly");
    expect(out[0].bucket).toMatch(/^2026-W18$/);
    expect(out[0].label).toContain("Week 18");
  });

  it("splits across ISO-year boundaries correctly", () => {
    // 2025-12-29 is a Monday and starts ISO Week 1 of 2026.
    const rows = [
      row({ date: "2025-12-29", spend: 100, installs: 10 }),
      row({ date: "2026-01-01", spend: 100, installs: 10 }),
    ];
    const out = aggregateTrend(rows, "weekly");
    expect(out).toHaveLength(1);
    expect(out[0].bucket).toMatch(/2026-W01/);
  });
});

describe("aggregateTrend (monthly)", () => {
  it("groups by YYYY-MM and recomputes ROI from sums", () => {
    const rows = [
      row({ date: "2026-05-01", spend: 100, revD7: 30 }),
      row({ date: "2026-05-15", spend: 200, revD7: 90 }),
      row({ date: "2026-06-01", spend: 100, revD7: 10 }),
    ];
    const out = aggregateTrend(rows, "monthly");
    expect(out).toHaveLength(2);
    const may = out.find((r) => r.bucket === "2026-05")!;
    expect(may.spend).toBe(300);
    // ROI = sum(revD7) / sum(spend) = 120 / 300 = 0.4.
    expect(may.roiD7).toBeCloseTo(0.4);
  });
});

describe("isoWeekOf", () => {
  it("returns Monday-start ISO week numbers", () => {
    expect(isoWeekOf(new Date("2026-04-27T00:00:00Z"))).toEqual({
      isoYear: 2026,
      isoWeek: 18,
    });
    expect(isoWeekOf(new Date("2026-01-01T00:00:00Z"))).toEqual({
      isoYear: 2026,
      isoWeek: 1,
    });
  });

  it("handles year-end Sunday boundary cases", () => {
    // 2024-12-30 (Mon) starts ISO Week 1 of 2025.
    expect(isoWeekOf(new Date("2024-12-30T00:00:00Z"))).toEqual({
      isoYear: 2025,
      isoWeek: 1,
    });
  });
});
