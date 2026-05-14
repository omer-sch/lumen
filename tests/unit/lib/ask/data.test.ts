// Layer 2 (lib unit). File under test: src/lib/ask/data.ts. Priority: P2.
// The Ask page's mock data layer. Deterministic by seed so the rows produced
// here are stable across runs; that determinism is what the Ask UI tests
// depend on (snapshot of the chart shape, top-N rows, ranges). This suite
// pins the structural contract: row count, channel coverage, value ranges.
import { describe, expect, it } from "vitest";

import { ASK_TODAY, allRows, type AskRow } from "@/lib/ask/data";

describe("ASK_TODAY", () => {
  it("is the hardcoded reference date the dashboard anchors to", () => {
    expect(ASK_TODAY).toBe("2026-04-30");
  });
});

describe("allRows shape", () => {
  it("returns the same array on repeated calls (cached module state)", () => {
    expect(allRows()).toBe(allRows());
  });

  it("emits one row per (day, channel, campaign) tuple over the 90-day window", () => {
    // CHANNELS = 4 (Meta, TikTok, Google, AppsFlyer)
    // CAMPAIGNS = 4 + 3 + 3 + 2 = 12 total
    // DAYS = 90
    // -> 90 * 12 = 1080 rows
    expect(allRows()).toHaveLength(1080);
  });

  it("covers exactly the four UA channels in the schema", () => {
    const channels = new Set(allRows().map((r) => r.channel));
    expect(channels).toEqual(new Set(["Meta", "TikTok", "Google", "AppsFlyer"]));
  });

  it("dates are ISO YYYY-MM-DD and span 90 unique days ending on ASK_TODAY", () => {
    const dates = new Set(allRows().map((r) => r.date));
    expect(dates.size).toBe(90);
    // Every date is a parseable ISO date.
    for (const d of dates) {
      expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    // The latest day is the anchor.
    const sorted = [...dates].sort();
    expect(sorted[sorted.length - 1]).toBe(ASK_TODAY);
  });
});

describe("allRows values", () => {
  it("every row has non-negative spend, installs >= 1, and finite cpi/roas", () => {
    for (const r of allRows()) {
      expect(r.spend).toBeGreaterThanOrEqual(0);
      expect(r.installs).toBeGreaterThanOrEqual(1);
      expect(Number.isFinite(r.cpi)).toBe(true);
      expect(Number.isFinite(r.roas)).toBe(true);
      expect(r.cpi).toBeGreaterThan(0);
    }
  });

  it("revenue is consistent with spend * roas to two decimals", () => {
    for (const r of allRows()) {
      expect(r.revenue).toBeCloseTo(+(r.spend * r.roas).toFixed(2), 1);
    }
  });

  it("Meta carries 4 campaigns; AppsFlyer carries 2", () => {
    const byChannel = (ch: AskRow["channel"]) => {
      const oneDay = allRows().filter(
        (r) => r.date === ASK_TODAY && r.channel === ch,
      );
      return new Set(oneDay.map((r) => r.campaign));
    };
    expect(byChannel("Meta").size).toBe(4);
    expect(byChannel("AppsFlyer").size).toBe(2);
  });
});
