import type { Intent, ReadyData } from "@/lib/analyst/types";
import { serverEnv } from "@/lib/env.server";
import type {
  ChannelCampaignSection,
  ChannelWeeklySection,
  PlatformOverallSection,
  ReportChapter,
} from "@/lib/reports/types";

import { historyRowToHistorical } from "@/lib/agents/hermes/snapshot";

import { parseActionItems, type ActionItem } from "../action-items";
import { createLimit, type Limit } from "../concurrency-limit";
import { summarizeFreshness, type FreshnessSummary } from "../freshness";
import {
  writeCampaignBreakdown,
  writePlatformOverall,
  writeWeeklyBreakdown,
  type CampaignCallout,
  type WeeklyWriteResult,
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
  /** Shared concurrency limit. The composition-level orchestrator
   *  builds one Limit and threads it down so the cap covers the
   *  entire run, not just a single chapter. When undefined the
   *  chapter creates a local Limit (useful for tests that call
   *  buildChapter directly). */
  limit?: Limit;
}): Promise<ChapterBuildResult | null> {
  const limit = args.limit ?? createLimit(serverEnv.LUMEN_MAX_CONCURRENT_WRITERS);
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

  // 1) Platform overall first. It is the synthesizing slide; the
  // per-channel writers do not depend on its output, but reviewers
  // expect the overall section to land first deterministically.
  // Holding everything else back until it resolves also gives the
  // user an ordered status feed in WS2.
  const overallTask = limit(() =>
    writePlatformOverall({
      ready: args.ready,
      networks: platformNetworks.slice().sort((a, b) => b.spend - a.spend),
      options: args.options,
      freshness: args.freshness,
    }),
  );

  // 2) Per-channel: prepare descriptors so we can fan out in parallel.
  type ChannelDescriptor = {
    channel: Intent["channels"][number];
    bqNames: readonly string[];
    channelLabel: string;
    renderChannel: "meta" | "google" | "tiktok" | "asa" | "search";
    channelCampaigns: ReadyData["campaigns"];
    callouts: CampaignCallout[];
  };
  const channelDescriptors: ChannelDescriptor[] = [];
  for (const channel of channelsToEmit) {
    const bqNames = BQ_NETWORK_NAMES_FOR_CHANNEL[channel] ?? [];
    const hasSpend = args.ready.networks.some(
      (n) => bqNames.includes(n.network) && n.spend > 0,
    );
    if (!hasSpend) continue;
    // Filter campaigns by BOTH channel AND platform. The campaign
    // classifier sets `platform` from the campaign_name (iOS /
    // Android / Web); non-classifiable campaigns leave the field
    // empty and are dropped here. This is the client-side bridge
    // until BQ workstream-D2 ships a real OS predicate.
    const channelCampaigns = args.ready.campaigns.filter(
      (c) =>
        bqNames.includes(c.network) &&
        campaignMatchesPlatform(c.platform, args.platform),
    );
    channelDescriptors.push({
      channel,
      bqNames,
      channelLabel: REPORT_CHANNEL_LABEL[channel],
      renderChannel: REPORT_CHANNEL_RENDER_ENUM[channel],
      channelCampaigns,
      callouts: pickCalloutsForChannel(channelCampaigns),
    });
  }

  // Fire every channel's (weekly, campaign) pair in parallel via the
  // shared limit. allSettled keeps a single writer's failure from
  // taking the whole composition down; placeholder sections fill in
  // for failed pairs and the user clicks Regenerate on the affected
  // card.
  const channelResults = await Promise.all(
    channelDescriptors.map(async (desc) => {
      const [weeklySettled, campaignSettled] = await Promise.allSettled([
        limit(() =>
          writeWeeklyBreakdown({
            ready: args.ready,
            bqNetworkNames: desc.bqNames,
            options: args.options,
          }),
        ),
        limit(() =>
          writeCampaignBreakdown({
            ready: args.ready,
            bqNetworkNames: desc.bqNames,
            options: args.options,
            actionItems: args.actionItems,
            callouts: desc.callouts,
            // WS4: keep the writer's view of campaigns scoped to the
            // chapter's platform so it never refers to "the iOS
            // campaign" inside an Android chapter.
            platformScope: {
              platform: args.platform,
              label: platformLabel,
            },
          }),
        ),
      ]);
      return {
        desc,
        weekly: settledToResult(weeklySettled, "channel_weekly", desc.channel),
        campaign: settledToResult(
          campaignSettled,
          "channel_campaign",
          desc.channel,
        ),
      };
    }),
  );

  const overallSettled = await Promise.allSettled([overallTask]);
  const overallRes = settledToResult(
    overallSettled[0],
    "platform_overall",
    null,
  );

  // Accumulate sections IN ORDER: platform_overall, then each channel's
  // (weekly, campaign) pair. Promise.all preserves array order, so
  // channelResults is already in channelsToEmit order. failed writers
  // still emit a placeholder section so the deck doesn't go missing.
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

  sections.push({
    id: "platform_overall",
    platform: args.platform,
    title: `${platformLabel} | Overall | Weekly Breakdown`,
    summary: { rows: [], total: emptySummaryRow() },
    bullets: [],
    prose: overallRes.blocks,
  });

  for (const { desc, weekly, campaign } of channelResults) {
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
        desc.bqNames.includes(n.network),
      );
      // Trailing-week history projected from ReadyData.history.networks
      // through the same BQ network labels the channel uses, sorted
      // oldest-first so the renderer stacks the rows in chronological
      // order. Maturity gate matches snapshot.ts: a week below the
      // D7 cohort threshold renders subD7/cpaD7 as null (-> em-dash).
      const channelHistory = args.ready.history.networks
        .filter((h) => desc.bqNames.includes(h.network))
        .slice()
        .sort((a, b) => a.weekIsoStart.localeCompare(b.weekIsoStart))
        .map(historyRowToHistorical);
      sections.push({
        id: "channel_weekly",
        platform: args.platform,
        channel: desc.renderChannel,
        title: `${platformLabel} | ${desc.channelLabel} | Weekly Breakdown`,
        currentWeek: currentRow
          ? {
              label: desc.channelLabel,
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
        history: channelHistory,
        bullets: [],
        prose: weekly.blocks,
      });
    }

    if (campaign.blocks.length > 0) {
      citations.push(...campaign.blockCitations);
      const calloutByCampaignId = new Map<string, CalloutColor>(
        desc.callouts.map((c) => [c.campaignId, c.color]),
      );
      sections.push({
        id: "channel_campaign",
        platform: args.platform,
        channel: desc.renderChannel,
        title: `${platformLabel} | ${desc.channelLabel} | Campaign Breakdown`,
        rows: desc.channelCampaigns.slice(0, 8).map((c) => ({
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

/**
 * Drain a PromiseSettledResult from one of the writers. On rejection
 * the run logs the error and substitutes a placeholder ProseBlock so
 * the deck still renders; the user clicks the section's Regenerate
 * button to retry. We deliberately do not re-throw -- partial deck
 * beats no deck.
 */
function settledToResult(
  settled: PromiseSettledResult<WeeklyWriteResult>,
  kind: "platform_overall" | "channel_weekly" | "channel_campaign",
  channel: Intent["channels"][number] | null,
): WeeklyWriteResult {
  if (settled.status === "fulfilled") return settled.value;
  const reason =
    settled.reason instanceof Error
      ? settled.reason.message
      : String(settled.reason);
  console.warn({
    event: "smart-reports.writer_failed",
    section_kind: kind,
    channel,
    reason,
  });
  // Empty prose so the renderer paints the legacy-fallback / "regenerate
  // me" placeholder (ProseBlockView's bullets-missing guard). Diagnostics
  // are zeroed so the call doesn't double-count tokens.
  return {
    blocks: [],
    blockCitations: [],
    diagnostics: {
      unclosedHighlightTags: 0,
      promptTokensIn: 0,
      promptTokensOut: 0,
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

  // Single Limit shared across every writer call in the composition.
  // Chapters fan out in parallel, channels inside each chapter fan
  // out in parallel; the cap (default 6) is the ceiling on
  // simultaneous Anthropic requests.
  const limit = createLimit(serverEnv.LUMEN_MAX_CONCURRENT_WRITERS);

  const builtChapters = await Promise.all(
    platformsToEmit.map((platform) =>
      buildChapter({
        ready: args.ready,
        intent: args.intent,
        platform,
        options: args.options,
        dataIsPlatformFiltered: args.dataIsPlatformFiltered,
        freshness,
        actionItems,
        limit,
      }),
    ),
  );

  // Preserve deterministic chapter order (platformsToEmit). null
  // results (chapter had no requested channels with spend) are
  // filtered out without disturbing the order of the rest.
  const chapters: ReportChapter[] = [];
  const citations: ProseCitation[][] = [];
  let unclosedTotal = 0;
  let promptTokensIn = 0;
  let promptTokensOut = 0;
  for (const built of builtChapters) {
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

/** Compare the classifier's case-loose platform string against the
 *  chapter's lowercased platform enum. Empty (unclassifiable) names
 *  return false so they don't leak into a per-platform chapter. */
function campaignMatchesPlatform(
  campaignPlatform: string,
  chapter: Platform,
): boolean {
  if (!campaignPlatform) return false;
  return campaignPlatform.toLowerCase() === chapter;
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
