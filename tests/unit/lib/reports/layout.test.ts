// Layer 2 (lib unit). File under test: src/lib/reports/layout.ts. Priority: P1.
// The layout step is what guarantees neither the on-screen carousel nor the
// PPTX exporter can produce a slide whose content runs past the 16:9 frame.
// These tests pin the per-section budgets so a regression to the splitter
// surfaces here, not in user-visible clipping.
import { describe, expect, it } from "vitest";

import { coverTitleSizing, layoutSlides } from "@/lib/reports/layout";
import type {
  CampaignCommentary,
  CampaignRow,
  ChannelCampaignSection,
  ChannelWeeklySection,
  HistoricalWeekRow,
  PlatformOverallSection,
  Report,
  WeeklyBullet,
  WeeklySummaryRow,
} from "@/lib/reports/types";

// =============================================================================
// Fixtures
// =============================================================================

const baseRow: WeeklySummaryRow = {
  label: "Facebook",
  spend: { value: 6000, delta: -4, tone: "neutral" },
  substart: { value: 200, delta: -10, tone: "bad" },
  subD0: { value: 50, delta: -20, tone: "bad" },
  subD7: { value: 80, delta: -8, tone: "bad", maturing: true },
  cpSubstart: { value: 30, delta: 6, tone: "bad" },
  cpaD0: { value: 120, delta: 9, tone: "bad" },
  cpaD7: { value: 75, delta: 4, tone: "bad", maturing: true },
};

const baseHistoryRow: HistoricalWeekRow = {
  label: "Week 17",
  range: "20 Apr 2026 to 26 Apr 2026",
  spend: 6000,
  impressions: 2_000_000,
  clicks: 30_000,
  installs: 1500,
  cpi: 4,
  substart: 350,
  cpSubstart: 17,
  subD0: 80,
  cpaD0: 75,
  subD7: 120,
  cpaD7: 50,
};

const baseCampaignRow: CampaignRow = {
  campaignName: "YH_FB_APP_IAP_Sub_Android_Evergreen_WW",
  spend: 1200,
  installs: 800,
  cpi: 1.5,
  substart: 60,
  cpSubstart: 20,
  cpSubstartDelta: 5,
  subD0: 12,
  cpaD0: 100,
  cpaD0Delta: 5,
  subD7: 20,
  cpaD7: 60,
  cpaD7Delta: 5,
};

const baseCommentary: CampaignCommentary = {
  groupLabel: "Group",
  observation: "An observation.",
  actionItem: "Doing the thing.",
};

const baseBullet: WeeklyBullet = { text: "A bullet" };

function bullets(n: number): WeeklyBullet[] {
  return Array.from({ length: n }, (_, i) => ({
    ...baseBullet,
    text: `bullet ${i + 1}`,
  }));
}

function historyRows(n: number): HistoricalWeekRow[] {
  return Array.from({ length: n }, (_, i) => ({
    ...baseHistoryRow,
    label: `Week ${17 - i}`,
  }));
}

function campaignRows(n: number): CampaignRow[] {
  return Array.from({ length: n }, (_, i) => ({
    ...baseCampaignRow,
    campaignName: `Campaign_${i + 1}`,
  }));
}

function commentary(n: number): CampaignCommentary[] {
  return Array.from({ length: n }, (_, i) => ({
    ...baseCommentary,
    groupLabel: `Group ${i + 1}`,
  }));
}

function platformOverallSection(
  overrides: Partial<PlatformOverallSection> = {},
): PlatformOverallSection {
  return {
    id: "platform_overall",
    platform: "android",
    title: "Android | Overall | Weekly Breakdown",
    summary: {
      rows: [baseRow, { ...baseRow, label: "Google" }],
      total: { ...baseRow, label: "Total" },
    },
    bullets: bullets(2),
    ...overrides,
  };
}

function channelWeeklySection(
  overrides: Partial<ChannelWeeklySection> = {},
): ChannelWeeklySection {
  return {
    id: "channel_weekly",
    platform: "android",
    channel: "meta",
    title: "Android | Meta | Weekly Breakdown",
    currentWeek: baseRow,
    history: historyRows(2),
    bullets: bullets(2),
    ...overrides,
  };
}

function channelCampaignSection(
  overrides: Partial<ChannelCampaignSection> = {},
): ChannelCampaignSection {
  return {
    id: "channel_campaign",
    platform: "android",
    channel: "meta",
    title: "Android | Meta | Campaign Breakdown",
    rows: campaignRows(5),
    commentary: commentary(2),
    ...overrides,
  };
}

function reportWith(sections: Report["sections"]): Report {
  return {
    id: "rpt_test",
    userId: "u",
    createdAt: 0,
    updatedAt: 0,
    prompt: "p",
    title: "Test report",
    period: "Apr 27 – May 3, 2026",
    clientLabel: "GlobalComix",
    sections,
  };
}

// =============================================================================
// Tests
// =============================================================================

describe("layoutSlides", () => {
  it("starts every report with a cover slide", () => {
    const report = reportWith([]);
    const slides = layoutSlides(report);
    expect(slides).toHaveLength(1);
    expect(slides[0]).toEqual({ kind: "cover", report });
  });

  it("drops empty sections", () => {
    const report = reportWith([
      // empty platform_overall: no summary rows, no bullets
      {
        id: "platform_overall",
        platform: "android",
        title: "Empty",
        summary: { rows: [], total: baseRow },
        bullets: [],
      },
    ]);
    const slides = layoutSlides(report);
    // Just the cover; the empty section produced nothing.
    expect(slides).toHaveLength(1);
  });

  // ---------------------------------------------------------------------------
  // platform_overall
  // ---------------------------------------------------------------------------

  describe("platform_overall", () => {
    it("fits a small section in one slide", () => {
      const section = platformOverallSection({ bullets: bullets(2) });
      const slides = layoutSlides(reportWith([section]));
      const overall = slides.filter((s) => s.kind === "platform_overall");
      expect(overall).toHaveLength(1);
      const first = overall[0];
      if (first.kind !== "platform_overall") throw new Error("bad kind");
      expect(first.slide.continuation).toEqual({ partIndex: 0, partTotal: 1 });
      expect(first.slide.bullets).toHaveLength(2);
      expect(first.slide.summary).toBe(section.summary);
      expect(first.slide.title).toBe(section.title); // no (cont.)
    });

    it("absorbs 4 bullets on the first slide via orphan-suppression", () => {
      // Cap is 3 + 1 slack = 4, so 4 still fits on slide 1.
      const section = platformOverallSection({ bullets: bullets(4) });
      const slides = layoutSlides(reportWith([section]));
      const overall = slides.filter((s) => s.kind === "platform_overall");
      expect(overall).toHaveLength(1);
      const first = overall[0];
      if (first.kind !== "platform_overall") throw new Error("bad kind");
      expect(first.slide.bullets).toHaveLength(4);
    });

    it("splits 11 bullets into 3 + 7 + 1 across three slides", () => {
      const section = platformOverallSection({ bullets: bullets(11) });
      const slides = layoutSlides(reportWith([section]));
      const overall = slides.filter((s) => s.kind === "platform_overall");
      expect(overall).toHaveLength(3);

      const a = overall[0];
      const b = overall[1];
      const c = overall[2];
      if (
        a.kind !== "platform_overall" ||
        b.kind !== "platform_overall" ||
        c.kind !== "platform_overall"
      ) {
        throw new Error("bad kind");
      }
      expect(a.slide.bullets).toHaveLength(3);
      expect(a.slide.summary).toBe(section.summary);
      expect(a.slide.continuation).toEqual({ partIndex: 0, partTotal: 3 });
      expect(a.slide.title).toBe(section.title);

      expect(b.slide.bullets).toHaveLength(7);
      expect(b.slide.summary).toBeNull();
      expect(b.slide.continuation).toEqual({ partIndex: 1, partTotal: 3 });
      expect(b.slide.title).toBe(`${section.title} (cont.)`);

      expect(c.slide.bullets).toHaveLength(1);
      expect(c.slide.continuation).toEqual({ partIndex: 2, partTotal: 3 });
    });
  });

  // ---------------------------------------------------------------------------
  // channel_weekly
  // ---------------------------------------------------------------------------

  describe("channel_weekly", () => {
    it("fits a small section in one slide", () => {
      const section = channelWeeklySection({
        history: historyRows(2),
        bullets: bullets(2),
      });
      const slides = layoutSlides(reportWith([section]));
      const weekly = slides.filter((s) => s.kind === "channel_weekly");
      expect(weekly).toHaveLength(1);
      const a = weekly[0];
      if (a.kind !== "channel_weekly") throw new Error("bad kind");
      expect(a.slide.currentWeek).toBe(section.currentWeek);
      expect(a.slide.history).toHaveLength(2);
      expect(a.slide.bullets).toHaveLength(2);
    });

    it("spills history rows past the first-slide cap into a continuation", () => {
      const section = channelWeeklySection({
        history: historyRows(8),
        bullets: bullets(2),
      });
      const slides = layoutSlides(reportWith([section]));
      const weekly = slides.filter((s) => s.kind === "channel_weekly");
      // slide 1: 2 history + 2 bullets
      // slide 2: 5 history
      // slide 3: 1 history
      expect(weekly).toHaveLength(3);

      const a = weekly[0];
      const b = weekly[1];
      const c = weekly[2];
      if (
        a.kind !== "channel_weekly" ||
        b.kind !== "channel_weekly" ||
        c.kind !== "channel_weekly"
      ) {
        throw new Error("bad kind");
      }

      expect(a.slide.currentWeek).toBe(section.currentWeek);
      expect(a.slide.history).toHaveLength(2);
      expect(a.slide.bullets).toHaveLength(2);

      expect(b.slide.currentWeek).toBeNull();
      expect(b.slide.history).toHaveLength(5);
      expect(b.slide.bullets).toHaveLength(0);
      expect(b.slide.continuation).toEqual({ partIndex: 1, partTotal: 3 });
      expect(b.slide.title.endsWith("(cont.)")).toBe(true);

      expect(c.slide.history).toHaveLength(1);
    });

    it("drains history first, then bullets onto separate continuation slides", () => {
      const section = channelWeeklySection({
        history: historyRows(7),
        bullets: bullets(9),
      });
      const slides = layoutSlides(reportWith([section]));
      const weekly = slides.filter((s) => s.kind === "channel_weekly");
      // slide 1: 2 history + 2 bullets
      // slide 2: 5 history (cont, rows)
      // slide 3: 7 bullets (cont, bullets)
      expect(weekly).toHaveLength(3);
      if (
        weekly[0].kind !== "channel_weekly" ||
        weekly[1].kind !== "channel_weekly" ||
        weekly[2].kind !== "channel_weekly"
      )
        throw new Error("bad kind");

      expect(weekly[0].slide.history).toHaveLength(2);
      expect(weekly[0].slide.bullets).toHaveLength(2);

      expect(weekly[1].slide.history).toHaveLength(5);
      expect(weekly[1].slide.bullets).toHaveLength(0);

      expect(weekly[2].slide.history).toHaveLength(0);
      expect(weekly[2].slide.bullets).toHaveLength(7);

      expect(weekly[2].slide.continuation).toEqual({
        partIndex: 2,
        partTotal: 3,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // channel_campaign
  // ---------------------------------------------------------------------------

  describe("channel_campaign", () => {
    it("fits a small section in one slide", () => {
      const section = channelCampaignSection({
        rows: campaignRows(5),
        commentary: commentary(1),
      });
      const slides = layoutSlides(reportWith([section]));
      const camp = slides.filter((s) => s.kind === "channel_campaign");
      expect(camp).toHaveLength(1);
      const a = camp[0];
      if (a.kind !== "channel_campaign") throw new Error("bad kind");
      expect(a.slide.rows).toHaveLength(5);
      expect(a.slide.commentary).toHaveLength(1);
      expect(a.slide.continuation).toEqual({ partIndex: 0, partTotal: 1 });
    });

    it("splits rows-first then commentary across multiple slides", () => {
      const section = channelCampaignSection({
        rows: campaignRows(10),
        commentary: commentary(5),
      });
      const slides = layoutSlides(reportWith([section]));
      const camp = slides.filter((s) => s.kind === "channel_campaign");
      // slide 1: 5 rows + 1 commentary
      // slide 2: 5 rows (rows cont)
      // slide 3: 2 commentary (commentary cont)
      // slide 4: 2 commentary (commentary cont)
      expect(camp).toHaveLength(4);
      if (
        camp[0].kind !== "channel_campaign" ||
        camp[1].kind !== "channel_campaign" ||
        camp[2].kind !== "channel_campaign" ||
        camp[3].kind !== "channel_campaign"
      )
        throw new Error("bad kind");

      expect(camp[0].slide.rows).toHaveLength(5);
      expect(camp[0].slide.commentary).toHaveLength(1);
      expect(camp[0].slide.continuation.partTotal).toBe(4);

      expect(camp[1].slide.rows).toHaveLength(5);
      expect(camp[1].slide.commentary).toHaveLength(0);

      expect(camp[2].slide.rows).toHaveLength(0);
      expect(camp[2].slide.commentary).toHaveLength(2);

      expect(camp[3].slide.rows).toHaveLength(0);
      expect(camp[3].slide.commentary).toHaveLength(2);
    });

    it("treats a rows-empty section as commentary-only on slide 1", () => {
      const section = channelCampaignSection({
        rows: [],
        commentary: commentary(3),
      });
      const slides = layoutSlides(reportWith([section]));
      const camp = slides.filter((s) => s.kind === "channel_campaign");
      expect(camp).toHaveLength(1);
      const a = camp[0];
      if (a.kind !== "channel_campaign") throw new Error("bad kind");
      expect(a.slide.rows).toHaveLength(0);
      expect(a.slide.commentary).toHaveLength(3);
    });
  });

  // ---------------------------------------------------------------------------
  // Legacy
  // ---------------------------------------------------------------------------

  describe("legacy sections", () => {
    it("renders each legacy section as a single slide with no continuation", () => {
      const report = reportWith([
        {
          id: "executive_summary",
          title: "Executive summary",
          body: "Body text.",
        },
        {
          id: "recommendations",
          title: "Recommendations",
          body: "",
          bullets: ["a", "b", "c"],
        },
      ]);
      const slides = layoutSlides(report);
      const legacy = slides.filter((s) => s.kind === "legacy");
      expect(legacy).toHaveLength(2);
      for (const l of legacy) {
        if (l.kind !== "legacy") throw new Error("bad kind");
        expect(l.slide.continuation).toEqual({ partIndex: 0, partTotal: 1 });
      }
    });
  });
});

// =============================================================================
// Cover title sizing
// =============================================================================

describe("coverTitleSizing", () => {
  it("returns 44pt for short titles", () => {
    expect(coverTitleSizing("Weekly UA performance summary").pptFontSize).toBe(
      44,
    );
  });

  it("returns 36pt for titles between 51 and 75 chars", () => {
    const title = "Weekly UA performance summary for the team review meeting!";
    expect(title.length).toBeGreaterThan(50);
    expect(title.length).toBeLessThanOrEqual(75);
    expect(coverTitleSizing(title).pptFontSize).toBe(36);
  });

  it("returns 28pt for titles between 76 and 110 chars", () => {
    const title = "A".repeat(95);
    expect(coverTitleSizing(title).pptFontSize).toBe(28);
  });

  it("returns 24pt with line-clamp for titles longer than 110 chars", () => {
    const title = "A".repeat(150);
    const sizing = coverTitleSizing(title);
    expect(sizing.pptFontSize).toBe(24);
    expect(sizing.classFragment).toContain("line-clamp-3");
  });
});
