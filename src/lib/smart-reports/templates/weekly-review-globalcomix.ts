import type { Intent, ReadyData } from "@/lib/analyst/types";
import type {
  ChannelCampaignSection,
  ChannelWeeklySection,
  PlatformOverallSection,
  ReportChapter,
} from "@/lib/reports/types";

import { parseActionItems, type ActionItem } from "../action-items";
import { summarizeFreshness, type FreshnessSummary } from "../freshness";
import {
  writeCampaignBreakdown,
  writePlatformOverall,
  writeWeeklyBreakdown,
  type CampaignCallout,
} from "../prose-writer";
import type {
  ComposeOptions,
  ProseBlock,
  ProseCitation,
} from "../types";
import type { CalloutColor } from "@/lib/reports/types";

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
  /** Optional freshness summary (Phase 3). When populated, the
   *  platform-overall writer surfaces per-network caveats. */
  freshness?: FreshnessSummary;
  /** Optional structured action items (Phase 3). The
   *  campaign-breakdown writer weaves them into matching family
   *  prose as `<> AI:` callouts. */
  actionItems?: ActionItem[];
}): Promise<ChapterBuildResult | null> {
  const platformLabel = PLATFORM_LABEL[args.platform];

  // Intersect the template's per-platform default channel list with
  // intent.channels so the deck respects the user's scope. A channel
  // the user did not pick is skipped entirely.
  const requestedChannels = new Set<Intent["channels"][number]>(
    args.intent.channels,
  );
  const channelsToEmit = PLATFORM_CHANNELS[args.platform].filter((c) =>
    requestedChannels.has(c),
  );
  if (channelsToEmit.length === 0) return null;

  // BQ network names that match any user-picked channel on this
  // platform. Used to filter the platform-overall summary too so the
  // overall table doesn't list channels the user did not ask for.
  const allowedNetworkNames = new Set<string>(
    channelsToEmit.flatMap((c) => BQ_NETWORK_NAMES_FOR_CHANNEL[c] ?? []),
  );
  const platformNetworks = networksForPlatform(
    args.ready,
    args.platform,
    args.dataIsPlatformFiltered,
  ).filter((n) => allowedNetworkNames.has(n.network));
  if (platformNetworks.length === 0) return null;

  // 1) Platform overall prose (cross-channel synthesis). Phase 3
  // optionally threads in the freshness summary so the writer can
  // weave caveats into the relevant channel's block.
  const overallRes = await writePlatformOverall({
    ready: args.ready,
    networks: platformNetworks.slice().sort((a, b) => b.spend - a.spend),
    options: args.options,
    freshness: args.freshness,
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

  // 2) Per-channel: weekly breakdown + campaign breakdown. Only the
  // intersection of PLATFORM_CHANNELS[platform] and intent.channels.
  for (const channel of channelsToEmit) {
    const bqNames = BQ_NETWORK_NAMES_FOR_CHANNEL[channel] ?? [];
    const hasSpend = args.ready.networks.some(
      (n) => bqNames.includes(n.network) && n.spend > 0,
    );
    if (!hasSpend) continue;

    const channelLabel = REPORT_CHANNEL_LABEL[channel];
    const renderChannel = REPORT_CHANNEL_RENDER_ENUM[channel];

    // Pre-pick top 3 callout rows per family by |spendDelta|. The
    // renderer uses this to paint a colored arrow on the row; the
    // prose-writer wraps any bullet referencing the row in matching
    // color markup so the highlight phrase pairs with the arrow.
    const channelCampaigns = args.ready.campaigns.filter((c) =>
      bqNames.includes(c.network),
    );
    const callouts = pickCalloutsForChannel(channelCampaigns);

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
        actionItems: args.actionItems,
        callouts,
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
      const calloutByCampaignId = new Map<string, CalloutColor>(
        callouts.map((c) => [c.campaignId, c.color]),
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
          highlight: calloutByCampaignId.get(c.campaign_id),
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
  // Intersect intent.platforms with the template's deterministic
  // platform order. When platform-filtered, emit every requested
  // platform in canonical order; degraded mode emits only the FIRST
  // requested platform so the cover caveat does not lie about scope.
  const requestedPlatforms = new Set<Platform>(args.intent.platforms);
  const platformsInOrder: Platform[] = (PLATFORM_ORDER as readonly Platform[])
    .filter((p) => requestedPlatforms.has(p));
  const fallbackPlatforms: Platform[] =
    platformsInOrder.length > 0
      ? platformsInOrder
      : [pickSinglePlatform(args.intent)];
  const platformsToEmit: Platform[] = args.dataIsPlatformFiltered
    ? fallbackPlatforms
    : fallbackPlatforms.slice(0, 1);

  // Phase 3 context shared across every chapter: freshness summary
  // (pure inspection of ReadyData.provenance + per-network sparseness)
  // and parsed action items (free-form notes from
  // options.actionNotes). Both empty by default; callers that don't
  // pass actionNotes simply emit no action callouts in prose.
  const freshness = summarizeFreshness(args.ready);
  const actionItems = parseActionItems(args.options.actionNotes, args.ready);

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
      freshness,
      actionItems,
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

// Top 3 callout colors in render order. Capped at 3 so a busy family
// doesn't paint the whole table; the writer also gets these three so
// its bullet highlights match the table arrows.
const CALLOUT_COLORS: readonly Extract<
  CalloutColor,
  "pink" | "orange" | "blue"
>[] = ["pink", "orange", "blue"] as const;

/** Score rows by |spendDelta| and assign callout colors in order. */
function pickCalloutsForChannel(
  rows: ReadyData["campaigns"],
): CampaignCallout[] {
  return rows
    .slice()
    .sort(
      (a, b) =>
        Math.abs(b.spendDelta ?? 0) - Math.abs(a.spendDelta ?? 0),
    )
    .slice(0, CALLOUT_COLORS.length)
    .filter((r) => Number.isFinite(r.spendDelta) && (r.spendDelta ?? 0) !== 0)
    .map((r, i) => ({
      campaignId: r.campaign_id,
      campaignName: r.campaign_name,
      family: r.family,
      spendDelta: r.spendDelta ?? 0,
      color: CALLOUT_COLORS[i],
    }));
}

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
