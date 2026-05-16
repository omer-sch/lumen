import "server-only";

import { findClient } from "@/lib/mock/clients";
import { reportChannelFromIntent } from "@/lib/agents/hermes/snapshot";
import { buildHermesSnapshot } from "@/lib/agents/hermes/snapshot";
import type { ReadyData } from "@/lib/analyst/types";
import type {
  ChannelCampaignSection,
  ChannelWeeklySection,
  PlatformOverallSection,
  Report,
  ReportSection,
} from "@/lib/reports/types";

import {
  summarizeCitationCoverage,
  validateCitations,
} from "./citation-validator";
import {
  writeCampaignBreakdown,
  writeWeeklyBreakdown,
} from "./prose-writer";
import type {
  ComposeOptions,
  ComposedReport,
  Intent,
  ProseBlock,
  ProseCitation,
} from "./types";

// composeReport — Smart Reports's public API.
//
// Reads ReadyData (the analyst-layer contract, src/lib/analyst), runs
// the prose-writer twice (weekly-breakdown + campaign-breakdown for
// Phase 1's single-channel-weekly template), parses highlights,
// validates citations against the provenance, and assembles a Report
// ready for the renderer.
//
// Phase 1 scope: ONE platform, ONE channel, two slides (weekly +
// campaign). Multi-section orchestration (full platform/channel
// matrix) lands in Phase 2; cross-platform synthesis + action items
// in Phase 3.

// ── Intent-channel <-> BQ-network mapping ──────────────────────────────
//
// Same mapping snapshot.ts uses for filtering. Kept inline rather than
// imported because composeReport doesn't depend on the snapshot module
// for anything else (the dependency graph stays narrow).

type IntentChannel = Intent["channels"][number];

const BQ_NETWORK_NAMES_FOR_CHANNEL: Record<IntentChannel, readonly string[]> = {
  meta: ["Meta", "Facebook"],
  google: ["Google", "Google Ads", "Google Ads ACI"],
  tiktok: ["TikTok"],
  apple_search_ads: ["Apple", "Apple Search Ads"],
  applovin: ["AppLovin"],
};

const REPORT_PLATFORM_LABEL: Record<"android" | "ios" | "web", string> = {
  android: "Android",
  ios: "iOS",
  web: "Web",
};
const REPORT_CHANNEL_LABEL: Record<
  ReturnType<typeof reportChannelFromIntent>,
  string
> = {
  meta: "Meta",
  google: "Google",
  tiktok: "TikTok",
  asa: "ASA",
  search: "Search",
};

// ── Public API ─────────────────────────────────────────────────────────

export async function composeReport(args: {
  readyData: ReadyData;
  intent: Intent;
  ownerUserId: string;
  options: ComposeOptions;
  /** Optional run id to stamp on the Report. Hermes passes its
   *  agent_runs row id; the manual builder mints a fresh uuid. */
  runId?: string | null;
  /** Optional contact name for the cover ("Prepared for X"). */
  contactName?: string | null;
}): Promise<ComposedReport> {
  const { readyData, intent, options, ownerUserId } = args;
  const platform = intent.platforms[0];
  const intentChannel = intent.channels[0];
  if (!platform) throw new Error("composeReport: intent.platforms is empty");
  if (!intentChannel) throw new Error("composeReport: intent.channels is empty");

  const bqNames = BQ_NETWORK_NAMES_FOR_CHANNEL[intentChannel] ?? [];
  const channel = reportChannelFromIntent(intentChannel);
  const platformLabel = REPORT_PLATFORM_LABEL[platform];
  const channelLabel = REPORT_CHANNEL_LABEL[channel];

  // Build the structural snapshot (tables, history rows) from the same
  // ReadyData we hand the prose-writers. Reuses the existing snapshot
  // builder so the Phase 1 output is structurally identical to the
  // pre-Smart Reports manual / Hermes flow; the prose is what's new.
  const snapshot = buildHermesSnapshot({
    intent,
    networks: readyData.networks,
    campaigns: readyData.campaigns,
    trend: readyData.trend,
    history: readyData.history.networks,
  });

  // Run both writers in parallel. Each returns ProseBlock[] +
  // per-block citations + diagnostics; we aggregate after.
  const [weeklyResult, campaignResult] = await Promise.all([
    writeWeeklyBreakdown({ ready: readyData, bqNetworkNames: bqNames, options }),
    writeCampaignBreakdown({ ready: readyData, bqNetworkNames: bqNames, options }),
  ]);

  // Citation validator. Phase 1 trust contract: every prose block with
  // citations must cite a queryId that ReadyData actually fetched.
  const allBlocks: ProseBlock[] = [...weeklyResult.blocks, ...campaignResult.blocks];
  const allCitations: ProseCitation[][] = [
    ...weeklyResult.blockCitations,
    ...campaignResult.blockCitations,
  ];
  const verdict = validateCitations(allBlocks, readyData, allCitations);
  if (!verdict.ok) {
    throw new Error(`composeReport citation validator failed: ${verdict.error}`);
  }

  // Assemble Report. Reuses today's section shapes (PlatformOverallSection,
  // ChannelWeeklySection, ChannelCampaignSection) but layers the new
  // prose blocks on top via the additive `prose` field (see
  // src/lib/reports/types.ts).
  const sections: ReportSection[] = [];
  const sectionsEmitted: string[] = [];

  if (snapshot.platformOverall) {
    // Phase 1 doesn't generate platform-overall prose (Phase 2 ships
    // the platform-overall prompt). We still emit the section so the
    // renderer renders the summary table without prose; matches the
    // legacy manual-builder behavior.
    const section: PlatformOverallSection = {
      id: "platform_overall",
      platform,
      title: `${platformLabel} | Overall | Weekly Breakdown`,
      summary: snapshot.platformOverall,
      bullets: [],
    };
    sections.push(section);
    sectionsEmitted.push("platform_overall");
  }

  if (snapshot.channelWeekly) {
    const section: ChannelWeeklySection = {
      id: "channel_weekly",
      platform,
      channel,
      title: `${platformLabel} | ${channelLabel} | Weekly Breakdown`,
      currentWeek: snapshot.channelWeekly.currentWeek,
      history: snapshot.channelWeekly.history,
      bullets: [],
      prose: weeklyResult.blocks,
    };
    sections.push(section);
    sectionsEmitted.push("channel_weekly");
  }

  if (snapshot.channelCampaign) {
    const section: ChannelCampaignSection = {
      id: "channel_campaign",
      platform,
      channel,
      title: `${platformLabel} | ${channelLabel} | Campaign Breakdown`,
      rows: snapshot.channelCampaign.rows,
      commentary: [],
      prose: campaignResult.blocks,
    };
    sections.push(section);
    sectionsEmitted.push("channel_campaign");
  }

  const now = Date.now();
  const draftTitle = `${snapshot.clientLabel} weekly review · ${snapshot.period.label}`;
  const report: Report = {
    id: args.runId ? `rpt_${args.runId}` : `rpt_${crypto.randomUUID()}`,
    userId: ownerUserId,
    client: intent.client,
    clientLabel: snapshot.clientLabel || findClient(intent.client).name,
    title: draftTitle,
    prompt: `Smart Reports draft for ${snapshot.clientLabel}`,
    period: snapshot.period.label,
    filterRange: snapshot.period.filterRange ?? undefined,
    createdAt: now,
    updatedAt: now,
    authoredBy: "nova",
    source: args.runId ? "hermes" : "manual",
    agentRunId: args.runId ?? null,
    preparedFor: args.contactName ?? null,
    sections,
  };

  // Coverage summary kept available for callers that want to surface
  // it in shadow-log diagnostics; unused in the synchronous compose
  // return path today.
  void summarizeCitationCoverage(allCitations);
  return {
    report,
    diagnostics: {
      sectionsEmitted,
      proseBlocks: allBlocks.length,
      highlights: allBlocks.reduce((a, b) => a + b.highlights.length, 0),
      citationsValidated: verdict.ok ? verdict.citationCount : 0,
      prompTokensIn:
        weeklyResult.diagnostics.promptTokensIn +
        campaignResult.diagnostics.promptTokensIn,
      promptTokensOut:
        weeklyResult.diagnostics.promptTokensOut +
        campaignResult.diagnostics.promptTokensOut,
    },
  };
}

// Public re-exports.
export type {
  ComposeOptions,
  ComposedReport,
  ComposeTemplate,
  HighlightToken,
  ProseBlock,
  ProseCitation,
} from "./types";
export { parseHighlightMarkup } from "./highlight-markup";
export { extractCitations, validateCitations } from "./citation-validator";
