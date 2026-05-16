import "server-only";

import { getReadyData } from "@/lib/analyst";
import type { Intent } from "@/lib/analyst/types";
import { buildHermesSnapshot } from "@/lib/agents/hermes/snapshot";
import { composeReport } from "@/lib/smart-reports";
import { serverEnv } from "@/lib/env.server";
import { clientHasReportData, findClient } from "@/lib/mock/clients";

import { isoWeek } from "./week";
import type {
  ChannelCampaignSection,
  ChannelWeeklySection,
  PlatformOverallSection,
  Report,
  ReportSection,
} from "./types";

// Manual report generator. Used by the /reports surface "Generate
// report" button. Pulls BQ rows + maturity-gated analytics through
// the shared analyst (src/lib/analyst), then feeds the rows into the
// same buildHermesSnapshot() Hermes uses so manual and agent drafts
// ship from the same trust contract: every numeric value traces back
// to a specific BQ query.
//
// What's different from the Hermes path:
//   * source: "manual" + authoredBy: "nova" instead of "hermes".
//   * Period comes from form inputs (the existing date-range picker)
//     instead of an intent the LLM parsed from an email body.
//   * The Intent shape needs platforms + channels; the manual builder
//     doesn't ask for either yet, so we hardcode the default to
//     Android / Meta to match the prior manual-report scope.
//     TODO(reports-ui): add platform + channel pickers to the
//     manual builder so the user can scope the deck explicitly.
//     Remove this hardcode when the pickers ship.
//   * Cutover: this file now calls getReadyData(intent) instead of
//     queryGlobalComix* directly. ReadyData carries the same BQ rows
//     plus analyst findings + provenance; the manual builder ignores
//     the findings for now (the renderer does not surface them yet)
//     and only reads networks/campaigns/trend. Single source of truth
//     for analytics data going forward.

const fmtDay = (d: Date) =>
  d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

const fmtIso = (d: Date) =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;

const newId = () => `rpt_${crypto.randomUUID()}`;

export type ReportPlatform = "android" | "ios" | "web";
export type ReportChannel =
  | "meta"
  | "google"
  | "tiktok"
  | "apple_search_ads";

type GenerateInput = {
  prompt: string;
  from: Date;
  to: Date;
  client: string;
  /** Phase 3 action notes from the ActionItemsInput textarea. The
   *  string is forwarded to composeReport.options.actionNotes when
   *  USE_SMART_REPORTS=live; ignored on the legacy snapshot-only
   *  path. */
  actionNotes?: string;
  /** Platform multi-select from the manual builder pickers. Defaults
   *  applied at the action layer; this list is treated as required
   *  here (at least one). Web is allowed but silently dropped when
   *  no Web-capable channel is selected. */
  platforms: ReportPlatform[];
  /** Channel multi-select from the manual builder pickers. */
  channels: ReportChannel[];
};

const TITLE_SOFT_LIMIT = 90;
function deriveTitleSeed(prompt: string): string {
  const firstLine = prompt.trim().split("\n")[0] ?? "";
  if (firstLine.length <= TITLE_SOFT_LIMIT) return firstLine;
  const head = firstLine.slice(0, TITLE_SOFT_LIMIT);
  const cut = head.lastIndexOf(" ");
  return cut > 0 ? head.slice(0, cut) : head;
}

// The yellowHEAD weekly format is week-bounded by definition, but the
// global filter can be set to any range. When the filter is wider than
// a single week we narrow the report period to the most recent complete
// ISO week within the range and surface the original range as a muted
// "Filter: ..." line on the cover. When the filter is already a single
// week (≤ 7 days inclusive) we keep the period as-is.
function deriveReportPeriod(
  from: Date,
  to: Date,
): { period: string; filterRange?: string; weekStart: Date; weekEnd: Date } {
  const diffDays = Math.round((to.getTime() - from.getTime()) / 86400000);
  const fullRange = `${fmtDay(from)} to ${fmtDay(to)}`;
  if (diffDays <= 6) {
    return { period: fullRange, weekStart: from, weekEnd: to };
  }
  const weekEnd = mostRecentCompleteISOSunday(to);
  const weekStart = new Date(weekEnd.getTime() - 6 * 86400000);
  if (weekStart.getTime() < from.getTime()) {
    return { period: fullRange, weekStart: from, weekEnd: to };
  }
  return {
    period: `${fmtDay(weekStart)} to ${fmtDay(weekEnd)}`,
    filterRange: fullRange,
    weekStart,
    weekEnd,
  };
}

function mostRecentCompleteISOSunday(d: Date): Date {
  const date = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
  const day = date.getUTCDay();
  date.setUTCDate(date.getUTCDate() - day);
  return date;
}

// Build the intent for the manual flow from the user's picker
// selections. We require at least one platform + one channel up
// front so the writer never receives an empty intent. Web is allowed
// in the platform list but silently dropped when no Web-capable
// channel was selected (today only Google runs on Web), so the deck
// does not render an empty Web chapter.
function buildIntent({
  client,
  period,
  weekStart,
  weekEnd,
  platforms,
  channels,
}: {
  client: string;
  period: string;
  weekStart: Date;
  weekEnd: Date;
  platforms: ReportPlatform[];
  channels: ReportChannel[];
}): Intent {
  const WEB_CAPABLE_CHANNELS: ReportChannel[] = ["google"];
  const hasWebChannel = channels.some((c) => WEB_CAPABLE_CHANNELS.includes(c));
  const filteredPlatforms = platforms.filter(
    (p) => p !== "web" || hasWebChannel,
  );
  // Fallback: if the filter wiped everything (e.g. user only picked
  // Web + a non-Web channel), keep the first picked platform as-is
  // so the run does not throw. The template's data-aware degrade
  // path handles it.
  const finalPlatforms =
    filteredPlatforms.length > 0 ? filteredPlatforms : [platforms[0]];

  return {
    client,
    platforms: finalPlatforms,
    channels,
    period: {
      label: period,
      iso_start: fmtIso(weekStart),
      iso_end: fmtIso(weekEnd),
    },
    focus: null,
    confidence: 1,
    doubts: [],
  };
}

export async function generateReport(input: GenerateInput): Promise<Report> {
  const { prompt, from, to, client, actionNotes, platforms, channels } = input;

  if (!clientHasReportData(client)) {
    throw new Error(
      `Reports are only available for clients with real BQ data; ${client} is not wired yet.`,
    );
  }
  if (platforms.length === 0) {
    throw new Error("Pick at least one platform.");
  }
  if (channels.length === 0) {
    throw new Error("Pick at least one channel.");
  }

  const c = findClient(client);
  const { period, filterRange, weekStart, weekEnd } = deriveReportPeriod(
    from,
    to,
  );

  const intent = buildIntent({
    client,
    period,
    weekStart,
    weekEnd,
    platforms,
    channels,
  });
  const ready = await getReadyData(intent);
  const { networks, campaigns, trend, history } = ready;

  // Smart Reports cutover. When USE_SMART_REPORTS=live, delegate the
  // entire prose + assembly path to composeReport with the multi-
  // section template; it self-degrades to a single chapter when the
  // BQ layer is still client-wide and surfaces the scope caveat.
  console.info({
    event: "reports.generate.path",
    use_smart_reports: serverEnv.USE_SMART_REPORTS,
    has_anthropic_key: Boolean(process.env.ANTHROPIC_API_KEY),
    has_action_notes: Boolean(actionNotes && actionNotes.length > 0),
    platforms,
    channels,
  });
  if (serverEnv.USE_SMART_REPORTS === "live") {
    const composed = await composeReport({
      readyData: ready,
      intent,
      ownerUserId: "mock-user-1",
      options: {
        template: "weekly-review-globalcomix",
        actionNotes: actionNotes,
      },
    });
    const titleSeed = deriveTitleSeed(prompt);
    const week = isoWeek(to);
    const title =
      titleSeed.length > 6
        ? titleSeed
        : `${c.name} · Week ${week} Review`;
    const proseCounts = composed.report.sections
      .map((s) => {
        const pose = (s as { prose?: unknown[] }).prose;
        return Array.isArray(pose) ? pose.length : 0;
      })
      .reduce((a, b) => a + b, 0);
    console.info({
      event: "reports.generate.smart_reports_done",
      sections: composed.report.sections.length,
      prose_blocks_total: proseCounts,
      diagnostics: composed.diagnostics,
    });
    return {
      ...composed.report,
      prompt,
      title,
      period,
      // Preserve the scope caveat (if the template stamped one) but
      // fall back to the date-narrowing filterRange when scope is
      // platform-filtered already.
      filterRange: composed.report.filterRange ?? filterRange,
      // The user explicitly picked platforms + channels; the pills
      // are now real signal, not a hardcoded default.
      suppressPlatformChannelPills: false,
      // Stamp the regeneration context so the per-section regenerate
      // route can rebuild the original Intent without round-tripping
      // through the UI.
      regenerationContext: {
        platforms,
        channels,
        periodIsoStart: fmtIso(weekStart),
        periodIsoEnd: fmtIso(weekEnd),
      },
    };
  }
  console.info({ event: "reports.generate.legacy_path" });

  const snapshot = buildHermesSnapshot({
    intent,
    networks,
    campaigns,
    trend,
    history: history.networks,
  });

  // Legacy snapshot-only assembly. Used when USE_SMART_REPORTS!=live.
  // The picker's first platform / channel anchor the section labels;
  // multi-channel support requires Smart Reports.
  const legacyPlatform = intent.platforms[0];
  const legacyChannel = intent.channels[0];
  const legacyChannelLabel = legacyChannel === "apple_search_ads"
    ? "ASA"
    : legacyChannel.charAt(0).toUpperCase() + legacyChannel.slice(1);
  const legacyChannelEnum: "meta" | "google" | "tiktok" | "asa" | "search" =
    legacyChannel === "apple_search_ads"
      ? "asa"
      : legacyChannel === "applovin"
        ? "search"
        : legacyChannel;
  const sections: ReportSection[] = [];

  if (snapshot.platformOverall) {
    const section: PlatformOverallSection = {
      id: "platform_overall",
      platform: legacyPlatform,
      title: "Overall | Weekly Breakdown",
      summary: snapshot.platformOverall,
      bullets: [],
    };
    sections.push(section);
  }

  if (snapshot.channelWeekly) {
    const section: ChannelWeeklySection = {
      id: "channel_weekly",
      platform: legacyPlatform,
      channel: legacyChannelEnum,
      title: `${legacyChannelLabel} | Weekly Breakdown`,
      currentWeek: snapshot.channelWeekly.currentWeek,
      history: snapshot.channelWeekly.history,
      bullets: [],
    };
    sections.push(section);
  }

  if (snapshot.channelCampaign) {
    const section: ChannelCampaignSection = {
      id: "channel_campaign",
      platform: legacyPlatform,
      channel: legacyChannelEnum,
      title: `${legacyChannelLabel} | Campaign Breakdown`,
      rows: snapshot.channelCampaign.rows,
      commentary: [],
    };
    sections.push(section);
  }

  const titleSeed = deriveTitleSeed(prompt);
  const week = isoWeek(to);
  const title =
    titleSeed.length > 6
      ? titleSeed
      : `${c.name} · Week ${week} Review`;

  const now = Date.now();
  return {
    id: newId(),
    userId: "mock-user-1",
    client,
    createdAt: now,
    updatedAt: now,
    prompt,
    title,
    period,
    filterRange,
    clientLabel: c.name,
    authoredBy: "nova",
    source: "manual",
    // The user explicitly picked platforms + channels in the manual
    // builder; show the pills so the deck reads the user's scope.
    suppressPlatformChannelPills: false,
    sections,
  };
}

