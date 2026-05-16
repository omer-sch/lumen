import "server-only";

import {
  queryGlobalComixCampaigns,
  queryGlobalComixNetworkBreakdown,
  queryGlobalComixTrend,
} from "@/lib/globalcomix-queries";
import { buildHermesSnapshot } from "@/lib/agents/hermes/snapshot";
import { clientHasReportData, findClient } from "@/lib/mock/clients";
import type { Intent } from "@/lib/agents/hermes/state";
import { isoWeek } from "./week";
import type {
  ChannelCampaignSection,
  ChannelWeeklySection,
  PlatformOverallSection,
  Report,
  ReportSection,
} from "./types";

// Manual report generator. Used by the /reports surface "Generate
// report" button. Was a hardcoded-fixture stub until the Hermes
// snapshot rewrite proved out the real-BQ path; this file now calls
// the same buildHermesSnapshot() Hermes uses so manual and agent
// drafts ship from the same trust contract: every numeric value
// traces back to a specific BQ query.
//
// What's different from the Hermes path:
//   * source: "manual" + authoredBy: "nova" instead of "hermes".
//   * Period comes from form inputs (the existing date-range picker)
//     instead of an intent the LLM parsed from an email body.
//   * The Hermes Intent shape needs platforms + channels; the manual
//     builder doesn't ask for either yet, so we hardcode the default
//     to Android / Meta to match the prior manual-report scope.
//     TODO(reports-ui): add platform + channel pickers to the
//     manual builder so the user can scope the deck explicitly.
//     Remove this hardcode when the pickers ship.

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

type GenerateInput = {
  prompt: string;
  from: Date;
  to: Date;
  client: string;
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

// Default intent for the manual flow: Android / Meta to match the
// prior manual-report scope. The platform stays a TODO until the
// builder UI exposes pickers.
function defaultIntentFor({
  client,
  period,
  weekStart,
  weekEnd,
}: {
  client: string;
  period: string;
  weekStart: Date;
  weekEnd: Date;
}): Intent {
  return {
    client,
    platforms: ["android"],
    channels: ["meta"],
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
  const { prompt, from, to, client } = input;

  if (!clientHasReportData(client)) {
    throw new Error(
      `Reports are only available for clients with real BQ data; ${client} is not wired yet.`,
    );
  }

  const c = findClient(client);
  const { period, filterRange, weekStart, weekEnd } = deriveReportPeriod(
    from,
    to,
  );
  const isoStart = fmtIso(weekStart);
  const isoEnd = fmtIso(weekEnd);

  // Same BQ trio Analyze pulls. The query layer is already cached so
  // a repeat manual run within the cache TTL is near-free.
  const [networks, campaigns, trend] = await Promise.all([
    queryGlobalComixNetworkBreakdown(client, isoStart, isoEnd),
    queryGlobalComixCampaigns(client, isoStart, isoEnd),
    queryGlobalComixTrend(client, isoStart, isoEnd),
  ]);

  const intent = defaultIntentFor({ client, period, weekStart, weekEnd });
  const snapshot = buildHermesSnapshot({
    intent,
    networks,
    campaigns,
    trend,
  });

  // Compose sections from the snapshot. Reuses the same Report shape
  // assembleHermesReport produces so the renderer handles both paths
  // identically. Manual reports keep authoredBy: "nova" and
  // source: "manual" so the cover byline + provenance read correctly.
  const sections: ReportSection[] = [];

  if (snapshot.platformOverall) {
    const section: PlatformOverallSection = {
      id: "platform_overall",
      platform: "android",
      title: "Overall | Weekly Breakdown",
      summary: snapshot.platformOverall,
      bullets: [],
    };
    sections.push(section);
  }

  if (snapshot.channelWeekly) {
    const section: ChannelWeeklySection = {
      id: "channel_weekly",
      platform: "android",
      channel: "meta",
      title: "Meta | Weekly Breakdown",
      currentWeek: snapshot.channelWeekly.currentWeek,
      history: snapshot.channelWeekly.history,
      bullets: [],
    };
    sections.push(section);
  }

  if (snapshot.channelCampaign) {
    const section: ChannelCampaignSection = {
      id: "channel_campaign",
      platform: "android",
      channel: "meta",
      title: "Meta | Campaign Breakdown",
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
    sections,
  };
}

