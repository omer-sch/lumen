// Layer 2 (lib unit). File under test: src/lib/reports/generate.ts. Priority: P1.
// The report assembler is what the Reports page calls when a user submits a
// generation prompt. The default `generateReport` routes to the yellowHEAD
// 3-section format; `generateLegacyReport` is kept around for tests and any
// localStorage rows persisted before the format switch. These tests pin the
// structural contract of each output.
import { describe, expect, it } from "vitest";

import {
  generateLegacyReport,
  generateReport,
  generateYellowHeadReport,
} from "@/lib/reports/generate";

const FROM = new Date("2026-04-27T00:00:00Z");
const TO = new Date("2026-05-03T00:00:00Z");

describe("generateReport (router)", () => {
  it("delegates to the yellowHEAD 3-section format by default", () => {
    const r = generateReport({
      prompt: "weekly review",
      from: FROM,
      to: TO,
      client: "globalcomix",
    });
    expect(r.sections).toHaveLength(3);
    expect(r.sections.map((s) => s.id)).toEqual([
      "platform_overall",
      "channel_weekly",
      "channel_campaign",
    ]);
  });

  it("falls back to a known client when the slug is unknown", () => {
    // findClient() returns CLIENTS[0] (globalcomix) when nothing matches.
    const r = generateReport({
      prompt: "x",
      from: FROM,
      to: TO,
      client: "no-such-client",
    });
    expect(r.clientLabel).toBe("GlobalComix");
  });
});

describe("generateYellowHeadReport", () => {
  it("derives the title from the first line of the prompt when it is long enough", () => {
    const r = generateYellowHeadReport({
      prompt: "Custom title for week 18\nadditional context",
      from: FROM,
      to: TO,
      client: "globalcomix",
    });
    expect(r.title).toBe("Custom title for week 18");
  });

  it("synthesizes a default title when the prompt is too short", () => {
    const r = generateYellowHeadReport({
      prompt: "x",
      from: FROM,
      to: TO,
      client: "globalcomix",
    });
    // ISO week of 2026-05-03 is 18.
    expect(r.title).toBe("GlobalComix · Week 18 Review");
  });

  it("renders the period as an en-dash range of formatted dates", () => {
    const r = generateYellowHeadReport({
      prompt: "x",
      from: FROM,
      to: TO,
      client: "globalcomix",
    });
    expect(r.period).toMatch(/Apr 27, 2026/);
    expect(r.period).toMatch(/May 3, 2026/);
  });

  it("includes Facebook, Google, TikTok rows + a Total row in platform_overall", () => {
    const r = generateYellowHeadReport({
      prompt: "x",
      from: FROM,
      to: TO,
      client: "globalcomix",
    });
    const section = r.sections.find((s) => s.id === "platform_overall");
    if (!section || section.id !== "platform_overall") throw new Error();
    expect(section.summary.rows.map((row) => row.label)).toEqual([
      "Facebook",
      "Google",
      "TikTok",
    ]);
    expect(section.summary.total.label).toBe("Total");
  });

  it("totals row sums the per-channel spend", () => {
    const r = generateYellowHeadReport({
      prompt: "x",
      from: FROM,
      to: TO,
      client: "globalcomix",
    });
    const section = r.sections.find((s) => s.id === "platform_overall");
    if (!section || section.id !== "platform_overall") throw new Error();
    const sumSpend = section.summary.rows.reduce(
      (a, row) => a + (typeof row.spend.value === "number" ? row.spend.value : 0),
      0,
    );
    expect(section.summary.total.spend.value).toBe(sumSpend);
  });

  it("channel_weekly carries the Facebook current-week row + at least 3 historical weeks", () => {
    const r = generateYellowHeadReport({
      prompt: "x",
      from: FROM,
      to: TO,
      client: "globalcomix",
    });
    const section = r.sections.find((s) => s.id === "channel_weekly");
    if (!section || section.id !== "channel_weekly") throw new Error();
    expect(section.channel).toBe("meta");
    expect(section.platform).toBe("android");
    expect(section.currentWeek.label).toBe("Facebook");
    expect(section.history.length).toBeGreaterThanOrEqual(3);
  });

  it("channel_campaign assigns exactly three callout colors (pink, orange, blue) to the top |Δ CPA D0|", () => {
    const r = generateYellowHeadReport({
      prompt: "x",
      from: FROM,
      to: TO,
      client: "globalcomix",
    });
    const section = r.sections.find((s) => s.id === "channel_campaign");
    if (!section || section.id !== "channel_campaign") throw new Error();
    const highlights = section.rows
      .map((row) => row.highlight)
      .filter((c): c is NonNullable<typeof c> => c != null)
      .sort();
    expect(highlights).toEqual(["blue", "orange", "pink"]);
  });

  it("authoredBy is 'nova' (Nova is the report writer)", () => {
    const r = generateYellowHeadReport({
      prompt: "x",
      from: FROM,
      to: TO,
      client: "globalcomix",
    });
    expect(r.authoredBy).toBe("nova");
  });

  it("ids are unique per call (UUID-prefixed)", () => {
    const a = generateYellowHeadReport({
      prompt: "x",
      from: FROM,
      to: TO,
      client: "globalcomix",
    });
    const b = generateYellowHeadReport({
      prompt: "x",
      from: FROM,
      to: TO,
      client: "globalcomix",
    });
    expect(a.id).not.toBe(b.id);
    expect(a.id).toMatch(/^rpt_/);
  });
});

describe("generateLegacyReport", () => {
  it("produces the five legacy sections in the canonical order", () => {
    const r = generateLegacyReport({
      prompt: "weekly summary",
      from: FROM,
      to: TO,
      client: "globalcomix",
    });
    expect(r.sections.map((s) => s.id)).toEqual([
      "executive_summary",
      "kpis",
      "channel_breakdown",
      "top_campaigns",
      "recommendations",
    ]);
  });

  it("KPI section emits four tiles (Spend, Installs, CPI, ROAS D7)", () => {
    const r = generateLegacyReport({
      prompt: "x",
      from: FROM,
      to: TO,
      client: "globalcomix",
    });
    const kpis = r.sections.find((s) => s.id === "kpis");
    if (!kpis || kpis.id !== "kpis") throw new Error();
    expect(kpis.kpis.map((k) => k.label)).toEqual([
      "Spend",
      "Installs",
      "CPI",
      "ROAS (D7)",
    ]);
  });

  it("top_campaigns is capped at five rows", () => {
    const r = generateLegacyReport({
      prompt: "x",
      from: FROM,
      to: TO,
      client: "globalcomix",
    });
    const top = r.sections.find((s) => s.id === "top_campaigns");
    if (!top || top.id !== "top_campaigns") throw new Error();
    expect(top.rows.length).toBeLessThanOrEqual(5);
  });

  it("recommendations emits exactly three bullets", () => {
    const r = generateLegacyReport({
      prompt: "x",
      from: FROM,
      to: TO,
      client: "globalcomix",
    });
    const recs = r.sections.find((s) => s.id === "recommendations");
    if (!recs || recs.id !== "recommendations") throw new Error();
    expect(recs.bullets).toHaveLength(3);
  });
});
