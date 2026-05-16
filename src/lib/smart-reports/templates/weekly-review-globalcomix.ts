import type { Intent, ReadyData } from "@/lib/analyst/types";
import type {
  ChannelCampaignSection,
  ChannelWeeklySection,
  PlatformOverallSection,
  ReportChapter,
} from "@/lib/reports/types";

import {
  writeCampaignBreakdown,
  writePlatformOverall,
  writeWeeklyBreakdown,
} from "../prose-writer";
import type {
  ComposeOptions,
  ProseBlock,
  ProseCitation,
} from "../types";

// Master template for GlobalComix's weekly review deck. Hardcodes the
// chapter order (Android, iOS, Web) and the channels each platform
// considers. The Week 18 reference deck is one instance of this
// template; the system produces an equivalent deck for any chosen
// period without literal week numbers or dates baked in.
//
// Platform-filter constraint
// --------------------------
// Today's BigQuery layer ships client-wide rows: snapshot.ts marks
// `dataScope: "client-wide-all-platforms"` because the per-network
// spend tables don't carry a uniform OS column and the cohort table's
// OS join is the only platform-aware signal. Until the workstream-D2
// platform-filter PR lands (TODO inside snapshot.ts), this template
// degrades to a single chapter for the FIRST platform in intent.platforms
// and surfaces a cover caveat ("numbers are client-wide across
// platforms"). The orchestration scaffolding is still in place: when
// the BQ layer gains real OS predicates, this file iterates over the
// platforms naturally and emits one chapter per active platform.

const PLATFORM_ORDER = ["android", "ios", "web"] as const;
type Platform = (typeof PLATFORM_ORDER)[number];

const PLATFORM_LABEL: Record<Platform, string> = {
  android: "Android",
  ios: "iOS",
  web: "Web",
};

// Channels we consider for each platform when iterating. Phase 2
// emits one channel_weekly + one channel_campaign pair per channel
// that has spend.
const PLATFORM_CHANNELS: Record<Platform, readonly Intent["channels"][number][]> = {
  android: ["meta", "google", "tiktok"],
  ios: ["meta", "google", "tiktok", "apple_search_ads"],
  web: ["google"],
};

// Map intent-channel enum -> BQ network labels (same shape snapshot.ts
// uses; mirrored here so the template doesn't depend on snapshot).
const BQ_NETWORK_NAMES_FOR_CHANNEL: Record<
  Intent["channels"][number],
  readonly string[]
> = {
  meta: ["Meta", "Facebook"],
  google: ["Google", "Google Ads", "Google Ads ACI"],
  tiktok: ["TikTok"],
  apple_search_ads: ["Apple", "Apple Search Ads"],
  applovin: ["AppLovin"],
};

const REPORT_CHANNEL_LABEL: Record<
  Intent["channels"][number],
  string
> = {
  meta: "Meta",
  google: "Google",
  tiktok: "TikTok",
  apple_search_ads: "ASA",
  applovin: "AppLovin",
};

const REPORT_CHANNEL_RENDER_ENUM: Record<
  Intent["channels"][number],
  "meta" | "google" | "tiktok" | "asa" | "search"
> = {
  meta: "meta",
  google: "google",
  tiktok: "tiktok",
  apple_search_ads: "asa",
  applovin: "search",
};

/** Networks with spend on a platform during the period.
 *  TODAY: returns the full network list because data is client-wide.
 *  Phase D2 swap: filter by `_OS_name === platform`. */
function networksForPlatform(
  ready: ReadyData,
  _platform: Platform,
  dataIsPlatformFiltered: boolean,
): ReadyData["networks"] {
  if (!dataIsPlatformFiltered) {
    // Client-wide path: every chapter would see the same rows, which
    // is misleading. The orchestrator (composeReport) checks the same
    // flag and degrades to a single chapter; this helper never runs
    // for >1 platform in that case.
    return ready.networks.filter((n) => n.spend > 0);
  }
  return ready.networks.filter((n) => n.spend > 0);
}

export type ChapterBuildResult = {
  chapter: ReportChapter;
  /** Citations from every prose block emitted in this chapter,
   *  flattened so composeReport can validate against ReadyData
   *  provenance in one pass. */
  citations: ProseCitation[][];
  /** Diagnostics. */
  diagnostics: {
    unclosedHighlightTags: number;
    promptTokensIn: number;
    promptTokensOut: number;
  };
};

export async function buildChapter(args: {
  ready: ReadyData;
  intent: Intent;
  platform: Platform;
  options: ComposeOptions;
  dataIsPlatformFiltered: boolean;
}): Promise<ChapterBuildResult | null> {
  const platformNetworks = networksForPlatform(
    args.ready,
    args.platform,
    args.dataIsPlatformFiltered,
  );
  if (platformNetworks.length === 0) return null;

  const platformLabel = PLATFORM_LABEL[args.platform];

  // 1) Platform overall prose (cross-channel synthesis).
  const overallRes = await writePlatformOverall({
    ready: args.ready,
    networks: platformNetworks.slice().sort((a, b) => b.spend - a.spend),
    options: args.options,
  });

  const sections: (
    | PlatformOverallSection
    | ChannelWeeklySection
    | ChannelCampaignSection
  )[] = [];
  const citations: ProseCitation[][] = [];
  let unclosedTotal = overallRes.diagnostics.unclosedHighlightTags;
  let promptTokensIn = overallRes.diagnostics.promptTokensIn;
  let promptTokensOut = overallRes.diagnostics.promptTokensOut;
  citations.push(...overallRes.blockCitations);

  // Platform-overall section. Summary table is left null here -- the
  // structural snapshot table is the channel_weekly's job in this
  // template; the platform-overall section is prose-only. The
  // renderer falls back to an empty summary gracefully.
  sections.push({
    id: "platform_overall",
    platform: args.platform,
    title: `${platformLabel} | Overall | Weekly Breakdown`,
    summary: { rows: [], total: emptySummaryRow() },
    bullets: [],
    prose: overallRes.blocks,
  });

  // 2) Per-channel: weekly breakdown + campaign breakdown.
  for (const channel of PLATFORM_CHANNELS[args.platform]) {
    const bqNames = BQ_NETWORK_NAMES_FOR_CHANNEL[channel] ?? [];
    const hasSpend = args.ready.networks.some(
      (n) => bqNames.includes(n.network) && n.spend > 0,
    );
    if (!hasSpend) continue;

    const channelLabel = REPORT_CHANNEL_LABEL[channel];
    const renderChannel = REPORT_CHANNEL_RENDER_ENUM[channel];

    const [weekly, campaign] = await Promise.all([
      writeWeeklyBreakdown({
        ready: args.ready,
        bqNetworkNames: bqNames,
        options: args.options,
      }),
      writeCampaignBreakdown({
        ready: args.ready,
        bqNetworkNames: bqNames,
        options: args.options,
      }),
    ]);

    unclosedTotal +=
      weekly.diagnostics.unclosedHighlightTags +
      campaign.diagnostics.unclosedHighlightTags;
    promptTokensIn +=
      weekly.diagnostics.promptTokensIn +
      campaign.diagnostics.promptTokensIn;
    promptTokensOut +=
      weekly.diagnostics.promptTokensOut +
      campaign.diagnostics.promptTokensOut;

    if (weekly.blocks.length > 0) {
      citations.push(...weekly.blockCitations);
      const currentRow = args.ready.networks.find((n) =>
        bqNames.includes(n.network),
      );
      sections.push({
        id: "channel_weekly",
        platform: args.platform,
        channel: renderChannel,
        title: `${platformLabel} | ${channelLabel} | Weekly Breakdown`,
        currentWeek: currentRow
          ? {
              // Render-shape row built from the BQ row; tones stay
              // neutral here because the prose block is what carries
              // the colored callout.
              label: channelLabel,
              spend: { value: Math.round(currentRow.spend), tone: "neutral" },
              substart: {
                value: Math.round(currentRow.subStart),
                tone: "neutral",
              },
              subD0: { value: Math.round(currentRow.subD0), tone: "neutral" },
              subD7: {
                value: Math.round(currentRow.subD7),
                tone: "neutral",
                maturing: true,
              },
              cpSubstart: {
                value: roundTo(currentRow.cpSubStart, 2),
                tone: "neutral",
              },
              cpaD0: {
                value: roundTo(currentRow.cpaD0, 2),
                tone: "neutral",
              },
              cpaD7: {
                value: roundTo(currentRow.cpaD7, 2),
                tone: "neutral",
                maturing: true,
              },
            }
          : emptySummaryRow(),
        history: [], // trailing-week table renders elsewhere; phase 2
        // does not change history projection in this template.
        bullets: [],
        prose: weekly.blocks,
      });
    }

    if (campaign.blocks.length > 0) {
      citations.push(...campaign.blockCitations);
      const channelCampaigns = args.ready.campaigns.filter((c) =>
        bqNames.includes(c.network),
      );
      sections.push({
        id: "channel_campaign",
        platform: args.platform,
        channel: renderChannel,
        title: `${platformLabel} | ${channelLabel} | Campaign Breakdown`,
        rows: channelCampaigns.slice(0, 8).map((c) => ({
          campaignName: c.campaign_name,
          spend: Math.round(c.spend),
          installs: Math.round(c.installs),
          cpi: roundTo(c.cpi, 2),
          substart: 0,
          cpSubstart: 0,
          cpSubstartDelta: 0,
          subD0: 0,
          cpaD0: 0,
          cpaD0Delta: 0,
          subD7: null,
          cpaD7: null,
          cpaD7Delta: null,
        })),
        commentary: [],
        prose: campaign.blocks,
      });
    }
  }

  const chapter: ReportChapter = {
    platform: args.platform,
    divider: {
      title: platformLabel,
      subtitle: undefined,
    },
    sections,
  };

  return {
    chapter,
    citations,
    diagnostics: {
      unclosedHighlightTags: unclosedTotal,
      promptTokensIn,
      promptTokensOut,
    },
  };
}

export type WeeklyReviewBuildResult = {
  chapters: ReportChapter[];
  citations: ProseCitation[][];
  diagnostics: {
    chapters: number;
    proseBlocks: number;
    unclosedHighlightTags: number;
    promptTokensIn: number;
    promptTokensOut: number;
  };
  /** When the BQ layer is client-wide, the template emits a single
   *  chapter (intent.platforms[0]) and surfaces this caveat for the
   *  cover slide. Empty / undefined when the data is platform-filtered
   *  and chapters render naturally. */
  scopeCaveat?: string;
};

export async function buildWeeklyReviewGlobalcomix(args: {
  ready: ReadyData;
  intent: Intent;
  options: ComposeOptions;
  /** True when ReadyData was fetched with a platform predicate (i.e.
   *  workstream-D2 has landed). False today; the template degrades
   *  to a single chapter. */
  dataIsPlatformFiltered: boolean;
}): Promise<WeeklyReviewBuildResult> {
  const platformsToEmit: Platform[] = args.dataIsPlatformFiltered
    ? [...PLATFORM_ORDER]
    : [pickSinglePlatform(args.intent)];

  const chapters: ReportChapter[] = [];
  const citations: ProseCitation[][] = [];
  let unclosedTotal = 0;
  let promptTokensIn = 0;
  let promptTokensOut = 0;

  for (const platform of platformsToEmit) {
    const built = await buildChapter({
      ready: args.ready,
      intent: args.intent,
      platform,
      options: args.options,
      dataIsPlatformFiltered: args.dataIsPlatformFiltered,
    });
    if (!built) continue;
    chapters.push(built.chapter);
    citations.push(...built.citations);
    unclosedTotal += built.diagnostics.unclosedHighlightTags;
    promptTokensIn += built.diagnostics.promptTokensIn;
    promptTokensOut += built.diagnostics.promptTokensOut;
  }

  const proseBlocks = chapters.reduce(
    (a, ch) =>
      a +
      ch.sections.reduce(
        (b, s) => b + ((s as { prose?: ProseBlock[] }).prose?.length ?? 0),
        0,
      ),
    0,
  );

  return {
    chapters,
    citations,
    diagnostics: {
      chapters: chapters.length,
      proseBlocks,
      unclosedHighlightTags: unclosedTotal,
      promptTokensIn,
      promptTokensOut,
    },
    scopeCaveat: args.dataIsPlatformFiltered
      ? undefined
      : "Numbers are client-wide across platforms; per-platform breakdown lands once the BigQuery platform filter ships.",
  };
}

// ── helpers ────────────────────────────────────────────────────────────

function pickSinglePlatform(intent: Intent): Platform {
  const first = intent.platforms[0];
  if (first && (PLATFORM_ORDER as readonly string[]).includes(first)) {
    return first as Platform;
  }
  return "android";
}

function emptySummaryRow() {
  return {
    label: "",
    spend: { value: 0, tone: "neutral" as const },
    substart: { value: 0, tone: "neutral" as const },
    subD0: { value: 0, tone: "neutral" as const },
    subD7: { value: 0, tone: "neutral" as const, maturing: true as const },
    cpSubstart: { value: 0, tone: "neutral" as const },
    cpaD0: { value: 0, tone: "neutral" as const },
    cpaD7: { value: 0, tone: "neutral" as const, maturing: true as const },
  };
}

function roundTo(n: number, digits: number): number {
  if (!Number.isFinite(n)) return 0;
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}
