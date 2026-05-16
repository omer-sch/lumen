import { findClient } from "@/lib/mock/clients";
import { getCampaigns } from "@/lib/mock/campaigns";
import { isoWeek } from "./week";
import type {
  CalloutColor,
  CampaignCommentary,
  CampaignRow,
  ChannelCampaignSection,
  ChannelWeeklySection,
  HistoricalWeekRow,
  PlatformOverallSection,
  Report,
  ReportSection,
  WeeklySummaryRow,
} from "./types";

const fmtDay = (d: Date) =>
  d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

const newId = () => `rpt_${crypto.randomUUID()}`;

type GenerateInput = {
  prompt: string;
  from: Date;
  to: Date;
  client: string;
};

const fmtMoney = (n: number) =>
  n >= 1000 ? `$${Math.round(n).toLocaleString()}` : `$${n.toFixed(2)}`;
const fmtCount = (n: number) => Math.round(n).toLocaleString();

// Title seed for both generators. The first line of the prompt is the
// natural title. We only trim when it would render unwieldy in the
// sidebar list, and we trim on a word boundary so the result never ends
// mid-word like "and recommenda".
const TITLE_SOFT_LIMIT = 90;
function deriveTitleSeed(prompt: string): string {
  const firstLine = prompt.trim().split("\n")[0] ?? "";
  if (firstLine.length <= TITLE_SOFT_LIMIT) return firstLine;
  const head = firstLine.slice(0, TITLE_SOFT_LIMIT);
  const cut = head.lastIndexOf(" ");
  return cut > 0 ? head.slice(0, cut) : head;
}

/**
 * The yellowHEAD weekly format is week-bounded by definition, but the
 * global filter can be set to any range. When the filter is wider than
 * a single week we narrow the report period to the most recent complete
 * ISO week within the range and surface the original range as a muted
 * "Filter: ..." line on the cover. When the filter is already a single
 * week (≤ 7 days inclusive) we keep the period as-is.
 */
function deriveReportPeriod(
  from: Date,
  to: Date,
): { period: string; filterRange?: string } {
  // 7 inclusive days renders with a 6-day diff when both endpoints are
  // at the same time of day.
  const diffDays = Math.round((to.getTime() - from.getTime()) / 86400000);
  const fullRange = `${fmtDay(from)} – ${fmtDay(to)}`;
  if (diffDays <= 6) return { period: fullRange };

  const weekEnd = mostRecentCompleteISOSunday(to);
  const weekStart = new Date(weekEnd.getTime() - 6 * 86400000);
  if (weekStart.getTime() < from.getTime()) {
    // No complete ISO week fits within the filter — fall back to the
    // raw range. (Theoretical edge case; the inclusive-7-day check
    // above covers the practical width.)
    return { period: fullRange };
  }
  return {
    period: `${fmtDay(weekStart)} – ${fmtDay(weekEnd)}`,
    filterRange: fullRange,
  };
}

/** Most recent Sunday <= d, treating Sunday as the end of an ISO week.
 *  If d is itself a Sunday, returns d. */
function mostRecentCompleteISOSunday(d: Date): Date {
  const date = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
  const day = date.getUTCDay(); // 0 = Sunday
  date.setUTCDate(date.getUTCDate() - day);
  return date;
}

// =============================================================================
// Public entry point — routes to the new yellowHEAD generator by default.
// The legacy 5-section generator is kept and exported so saved reports and
// any tests that pin against it still work.
// =============================================================================

export function generateReport(input: GenerateInput): Report {
  // Iteration scope: every fresh report uses the yellowHEAD format. The
  // legacy path stays in this file as `generateLegacyReport` so we can
  // route per-prompt later without bringing the old shape back from
  // version control.
  return generateYellowHeadReport(input);
}

// =============================================================================
// New: yellowHEAD weekly-review generator (Android + Meta only).
//
// This produces a report whose sections are:
//   1. platform_overall — Android, with a per-channel summary table
//   2. channel_weekly — Android | Meta, current week + last 3 weeks
//   3. channel_campaign — Android | Meta, 5 campaigns, top 3 by |Δ CPA D0|
//      get pink/orange/blue callouts that tie back to commentary.
//
// Future iterations add iOS, Web, ASA, TikTok, Google. The shape is here
// to make those extensions cheap; the data is hardcoded for now.
// =============================================================================

export function generateYellowHeadReport({
  prompt,
  from,
  to,
  client,
}: GenerateInput): Report {
  const c = findClient(client);
  const clientLabel = c.name;
  const { period, filterRange } = deriveReportPeriod(from, to);
  const week = isoWeek(to);

  const titleSeed = deriveTitleSeed(prompt);
  const title =
    titleSeed.length > 6
      ? titleSeed
      : `${clientLabel} · Week ${week} Review`;

  // Channel mix under Android. Facebook (Meta) is the channel we render
  // a full sub-tree for in this iteration. Google and TikTok rows exist
  // so the platform-overall summary table has the multi-channel shape
  // analysts expect, but their detail sections are not generated yet.
  const facebookRow: WeeklySummaryRow = {
    label: "Facebook",
    spend: { value: 6230, delta: -4.1, tone: "neutral" },
    substart: { value: 278, delta: -28.7, tone: "bad" },
    subD0: { value: 54, delta: -33.2, tone: "bad" },
    subD7: { value: 88, delta: -12.4, tone: "bad", maturing: true },
    cpSubstart: { value: 22.41, delta: 34.8, tone: "bad" },
    cpaD0: { value: 115.37, delta: 39.0, tone: "bad" },
    cpaD7: { value: 70.79, delta: 9.6, tone: "bad", maturing: true },
  };
  const googleRow: WeeklySummaryRow = {
    label: "Google",
    spend: { value: 3580, delta: 6.2, tone: "good" },
    substart: { value: 165, delta: 12.3, tone: "good" },
    subD0: { value: 39, delta: 8.4, tone: "good" },
    subD7: { value: 66, delta: 3.1, tone: "good", maturing: true },
    cpSubstart: { value: 21.7, delta: -5.4, tone: "good" },
    cpaD0: { value: 91.79, delta: -2.1, tone: "good" },
    cpaD7: { value: 54.24, delta: -1.4, tone: "good", maturing: true },
  };
  const tiktokRow: WeeklySummaryRow = {
    label: "TikTok",
    spend: { value: 1820, delta: -11.0, tone: "neutral" },
    substart: { value: 71, delta: -18.6, tone: "bad" },
    subD0: { value: 14, delta: -22.2, tone: "bad" },
    subD7: { value: 22, delta: -7.5, tone: "bad", maturing: true },
    cpSubstart: { value: 25.63, delta: 9.4, tone: "bad" },
    cpaD0: { value: 130.0, delta: 14.1, tone: "bad" },
    cpaD7: { value: 82.73, delta: 3.8, tone: "bad", maturing: true },
  };

  const totals = sumRows([facebookRow, googleRow, tiktokRow]);

  const androidOverall: PlatformOverallSection = {
    id: "platform_overall",
    platform: "android",
    title: "Android | Overall | Weekly Breakdown",
    summary: {
      rows: [facebookRow, googleRow, tiktokRow],
      total: totals,
    },
    bullets: [
      {
        text: "CPA D0 rose 18% week over week across Android, driven primarily by Meta. Sub D7 is still maturing and may close part of the gap.",
        tone: "headline-bad",
      },
      {
        text: "Google was the only channel to improve on every cost metric; we will rebalance budget toward it while Meta is in flux.",
      },
      {
        text: "TikTok volume contracted as expected after pausing the Invincible ad group; CPA improvement is the next milestone to watch.",
      },
    ],
  };

  // ---------------------------------------------------------------------
  // Android | Meta sub-tree
  // ---------------------------------------------------------------------
  const metaWeekly: ChannelWeeklySection = {
    id: "channel_weekly",
    platform: "android",
    channel: "meta",
    title: "Android | Meta | Weekly Breakdown",
    currentWeek: facebookRow,
    history: buildMetaHistory(),
    bullets: [
      {
        text: "CP SubStart climbed 35% and CPA D0 climbed 39% — the worst week on Meta in five weeks.",
        tone: "headline-bad",
      },
      {
        text: "The decline is concentrated in the new SubStart Archetype ad sets; Evergreen India remained the bright spot.",
      },
      {
        text: "We expect additional improvement in CPA D7 as Sub D7 attribution finishes settling later this week.",
      },
    ],
  };

  const campaignRows = buildMetaCampaignRows();
  assignCallouts(campaignRows);
  const commentary = buildMetaCommentary();

  const metaCampaign: ChannelCampaignSection = {
    id: "channel_campaign",
    platform: "android",
    channel: "meta",
    title: "Android | Meta | Campaign Breakdown",
    rows: campaignRows,
    commentary,
  };

  const sections: ReportSection[] = [androidOverall, metaWeekly, metaCampaign];

  return {
    id: newId(),
    userId: "mock-user-1",
    client,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    prompt,
    title,
    period,
    filterRange,
    clientLabel,
    authoredBy: "nova",
    source: "manual",
    sections,
  };
}

export function sumRows(rows: WeeklySummaryRow[]): WeeklySummaryRow {
  const num = (v: WeeklySummaryRow["spend"]) =>
    typeof v.value === "number" ? v.value : 0;
  const totalSpend = rows.reduce((a, r) => a + num(r.spend), 0);
  const totalSubstart = rows.reduce((a, r) => a + num(r.substart), 0);
  const totalSubD0 = rows.reduce((a, r) => a + num(r.subD0), 0);
  const totalSubD7 = rows.reduce((a, r) => a + num(r.subD7), 0);
  const safeDiv = (a: number, b: number) => (b > 0 ? a / b : 0);
  return {
    label: "Total",
    spend: { value: totalSpend, delta: -3.5, tone: "neutral" },
    substart: { value: totalSubstart, delta: -16.0, tone: "bad" },
    subD0: { value: totalSubD0, delta: -19.4, tone: "bad" },
    subD7: { value: totalSubD7, delta: -7.8, tone: "bad", maturing: true },
    cpSubstart: { value: +safeDiv(totalSpend, totalSubstart).toFixed(2), delta: 14.5, tone: "bad" },
    cpaD0: { value: +safeDiv(totalSpend, totalSubD0).toFixed(2), delta: 18.3, tone: "bad" },
    cpaD7: { value: +safeDiv(totalSpend, totalSubD7).toFixed(2), delta: 4.6, tone: "bad", maturing: true },
  };
}

export function buildMetaHistory(): HistoricalWeekRow[] {
  return [
    {
      label: "Week 17",
      range: "20 Apr 2026 to 26 Apr 2026",
      spend: 6498,
      impressions: 2_180_000,
      clicks: 31_400,
      installs: 1620,
      cpi: 4.01,
      substart: 390,
      cpSubstart: 16.66,
      subD0: 81,
      cpaD0: 80.22,
      subD7: 124,
      cpaD7: 52.4,
    },
    {
      label: "Week 16",
      range: "13 Apr 2026 to 19 Apr 2026",
      spend: 6105,
      impressions: 2_040_000,
      clicks: 30_120,
      installs: 1580,
      cpi: 3.86,
      substart: 372,
      cpSubstart: 16.41,
      subD0: 78,
      cpaD0: 78.27,
      subD7: 119,
      cpaD7: 51.3,
    },
    {
      label: "Week 15",
      range: "06 Apr 2026 to 12 Apr 2026",
      spend: 5980,
      impressions: 1_995_000,
      clicks: 29_400,
      installs: 1540,
      cpi: 3.88,
      substart: 358,
      cpSubstart: 16.7,
      subD0: 75,
      cpaD0: 79.73,
      subD7: 115,
      cpaD7: 52.0,
    },
  ];
}

export function buildMetaCampaignRows(): CampaignRow[] {
  return [
    {
      campaignName:
        "YH_FB_APP_FULL_IAP_Sub_Android_Evergreen_WW-Top",
      spend: 1702,
      installs: 1166,
      cpi: 1.46,
      substart: 65,
      cpSubstart: 26.18,
      cpSubstartDelta: 18.4,
      subD0: 14,
      cpaD0: 121.57,
      cpaD0Delta: 32.7,
      subD7: 24,
      cpaD7: 70.69,
      cpaD7Delta: 19.2,
    },
    {
      campaignName:
        "YH_FB_APP_FULL_IAP_Sub_Android_Evergreen_WW-Other",
      spend: 1054,
      installs: 643,
      cpi: 1.64,
      substart: 44,
      cpSubstart: 23.84,
      cpSubstartDelta: 1.2,
      subD0: 11,
      cpaD0: 95.82,
      cpaD0Delta: 4.6,
      subD7: 18,
      cpaD7: 58.55,
      cpaD7Delta: 1.8,
    },
    {
      campaignName:
        "YH_FB_APP_FULL_IAP_SubStart_Android_Evergreen_US",
      spend: 1554,
      installs: 380,
      cpi: 4.09,
      substart: 48,
      cpSubstart: 32.19,
      cpSubstartDelta: 27.6,
      subD0: 9,
      cpaD0: 172.67,
      cpaD0Delta: 45.1,
      subD7: 14,
      cpaD7: 110.99,
      cpaD7Delta: 22.7,
    },
    {
      campaignName:
        "YH_FB_APP_FULL_IAP_SubStart_Android_Evergreen_India",
      spend: 493,
      installs: 1198,
      cpi: 0.41,
      substart: 27,
      cpSubstart: 18.29,
      cpSubstartDelta: -8.5,
      subD0: 8,
      cpaD0: 61.62,
      cpaD0Delta: -23.3,
      subD7: 11,
      cpaD7: 44.82,
      cpaD7Delta: -14.1,
    },
    {
      campaignName:
        "YH_FB_APP_FULL_IAP_SubStart_Android_Evergreen_WW-Top",
      spend: 1427,
      installs: 712,
      cpi: 2.0,
      substart: 94,
      cpSubstart: 15.18,
      cpSubstartDelta: 5.2,
      subD0: 12,
      cpaD0: 118.92,
      cpaD0Delta: 11.4,
      subD7: 21,
      cpaD7: 67.95,
      cpaD7Delta: 6.0,
    },
  ];
}

/**
 * Picks the three rows with the largest absolute CPA D0 delta. The single
 * worst (most positive delta) gets pink; the next biggest movers get
 * orange and blue. The order is stable so the commentary highlights wired
 * below land on the same colors.
 */
export function assignCallouts(rows: CampaignRow[]) {
  const sorted = [...rows]
    .map((r, idx) => ({ idx, mag: Math.abs(r.cpaD0Delta) }))
    .sort((a, b) => b.mag - a.mag)
    .slice(0, 3);

  const palette: CalloutColor[] = ["pink", "orange", "blue"];
  sorted.forEach(({ idx }, i) => {
    rows[idx].highlight = palette[i];
  });
}

export function buildMetaCommentary(): CampaignCommentary[] {
  return [
    {
      groupLabel: "Sub (Evergreen)",
      observation:
        "The Top Geos campaign increased in CPA by over 30%, though it shows signs of improvement over the last few days. WW-Other was roughly flat and continues to deliver dependable mid-funnel volume.",
      actionItem:
        "Holding budget on WW-Top while we let the latest creative refresh prove itself; no change recommended this week.",
      highlights: [
        {
          color: "pink",
          phrase: "Top Geos campaign increased in CPA by over 30%",
        },
      ],
    },
    {
      groupLabel: "SubStart (Evergreen)",
      observation:
        "Both Evergreen-US and the new Archetype ad sets delivered poor results in terms of CPA, although CP SubStart on the WW-Top group remains decent. The decline comes primarily from the new Archetype creative pack.",
      actionItem:
        "Pausing the two lowest-performing Archetype ad sets; rotating in two new variations of the proven hook for next week's test.",
      highlights: [
        { color: "orange", phrase: "poor results in terms of CPA" },
      ],
    },
    {
      groupLabel: "SubStart (India)",
      observation:
        "The India campaign improved in CPA week over week, although CP SubStart declined slightly. Volume is healthy and conversion quality is holding.",
      actionItem:
        "Adding 10% to the India budget for next week and adding two new ad sets that target adjacent Tier-2 audiences.",
      highlights: [
        { color: "blue", phrase: "improved in CPA week over week" },
      ],
    },
  ];
}

// =============================================================================
// Legacy 5-section generator — preserved for tests and any code path that
// imports it explicitly. ReportDocument still knows how to render its
// sections via the fallback branches.
// =============================================================================

export function generateLegacyReport({
  prompt,
  from,
  to,
  client,
}: GenerateInput): Report {
  const c = findClient(client);
  const campaigns = getCampaigns({ from, to, client });
  const topCampaigns = campaigns.slice(0, 5);

  const { period, filterRange } = deriveReportPeriod(from, to);
  const clientLabel = c.name;

  const titleSeed = deriveTitleSeed(prompt);
  const title =
    titleSeed.length > 6
      ? titleSeed
      : `UA performance summary · ${clientLabel}`;

  const totalSpend = campaigns.reduce((a, r) => a + r.spend, 0);
  const totalInstalls = campaigns.reduce((a, r) => a + r.installs, 0);
  const totalCpi = totalInstalls > 0 ? totalSpend / totalInstalls : 0;
  const weightedRoas =
    totalSpend > 0
      ? campaigns.reduce((a, r) => a + r.roas * r.spend, 0) / totalSpend
      : 0;

  type ChannelRoll = { channel: string; spend: number; share: number };
  const byChannel = new Map<string, number>();
  for (const r of campaigns) {
    byChannel.set(r.channel, (byChannel.get(r.channel) ?? 0) + r.spend);
  }
  const channelRollup: ChannelRoll[] = [...byChannel.entries()]
    .map(([channel, spend]) => ({
      channel,
      spend,
      share: totalSpend > 0 ? (spend / totalSpend) * 100 : 0,
    }))
    .sort((a, b) => b.spend - a.spend);

  const sections: ReportSection[] = [
    {
      id: "executive_summary",
      title: "Executive summary",
      body: `Performance summary for ${clientLabel}, ${period}. Total UA spend reached ${fmtMoney(totalSpend)} across ${campaigns.length} active campaigns with a blended D7 ROAS of ${weightedRoas.toFixed(2)}x.`,
    },
    {
      id: "kpis",
      title: "Key metrics",
      body: `Aggregated across all UA channels for the active window.`,
      kpis: [
        { label: "Spend",     value: fmtMoney(totalSpend),         delta: "—", tone: "neutral" },
        { label: "Installs",  value: fmtCount(totalInstalls),      delta: "—", tone: "neutral" },
        { label: "CPI",       value: `$${totalCpi.toFixed(2)}`,    delta: "—", tone: "neutral" },
        { label: "ROAS (D7)", value: `${weightedRoas.toFixed(2)}x`, delta: "—", tone: "neutral" },
      ],
    },
    {
      id: "channel_breakdown",
      title: "Channel breakdown",
      body: `Spend share by channel for the active window.`,
      rows: channelRollup.map((m, i) => ({
        channel: m.channel,
        spend: fmtMoney(m.spend),
        share: `${m.share.toFixed(1)}%`,
        roas: `${(1.55 - i * 0.16).toFixed(2)}x`,
      })),
    },
    {
      id: "top_campaigns",
      title: "Top campaigns",
      body: `Five highest-spend campaigns in the window. Sorted by spend; ROAS shown for context.`,
      rows: topCampaigns.map((c) => ({
        name: c.name,
        channel: c.channel,
        spend: fmtMoney(c.spend),
        installs: fmtCount(c.installs),
        roas: `${c.roas.toFixed(2)}x`,
      })),
    },
    {
      id: "recommendations",
      title: "Recommendations",
      body: `Three plays Lumen suggests, based on the patterns this window surfaced. Each is a hypothesis the team can test inside the existing budget.`,
      bullets: [
        `Promote the top-performing TikTok HC creatives to their own ad set and bump budget by ~25% — installs are up 34% with CPI dropping.`,
        `Refresh the Google UAC creative pack — CPI has drifted upward for five days against flat installs, classic saturation pattern.`,
        `Carve the LAL-3-Payers segment into its own ad set with its own budget — early conversion signal is 2.1× the campaign average.`,
      ],
    },
  ];

  return {
    id: newId(),
    userId: "mock-user-1",
    client,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    prompt,
    title,
    period,
    filterRange,
    clientLabel,
    authoredBy: "nova",
    source: "manual",
    sections,
  };
}
