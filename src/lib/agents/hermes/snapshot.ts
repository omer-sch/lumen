import "server-only";

import { findClient } from "@/lib/mock/clients";
import type {
  CampaignRow as ReportCampaignRow,
  HistoricalWeekRow,
  WeeklySummaryRow,
} from "@/lib/reports/types";
import type {
  BQTrendPointByNetwork,
  CampaignRow as BQCampaignRow,
  NetworkRow as BQNetworkRow,
} from "@/types/dashboard";

import { COHORT_D7_MATURITY_THRESHOLD } from "@/lib/analyst/maturity-gates";
import type { WeeklyHistoryRow } from "@/lib/analyst/types";

import type { HermesSnapshot, Intent } from "./state";

// COHORT_D7_MATURITY_THRESHOLD lifted to src/lib/analyst/maturity-gates.ts
// so anomstack, comparisons, and this file consult one constant. The
// behavior here is unchanged: when sub_d7 is below the threshold the
// cell renders as null with maturing=true (an em-dash in the deck).

// Snapshot builder. Reads the BigQuery rows Analyze already fetched
// (networks, campaigns, trend) and shapes them into the
// WeeklySummaryRow / CampaignRow tables the deck renderer expects.
//
// Trust-contract fix (workstream A, post-v0.5-C): every numeric value
// rendered in the deck must trace back to a specific BQ query, the
// same promise the citation validator enforces for the prose. The
// previous version of this file hardcoded fixture rows on every run
// regardless of the real data; that made the validator's "every claim
// cited" promise a lie because the tables it sat next to were stock
// mock data. This rewrite uses only what Analyze pulled.
//
// What's available from the existing BQ queries:
//   * networks: per-network totals for the active period (spend, sub
//     funnel, ROAS, plus trailingCpaD7Avg as a 30-day prior baseline).
//   * campaigns: per-campaign spend + installs + cpi + spendDelta
//     (period-over-period at the campaign level).
//   * trend: daily per-(date, network) rows for the active period.
//
// What's NOT available without a new BQ query:
//   * Period-over-period deltas at the NETWORK level for spend / sub
//     funnel (only cpaD7 has trailing baseline). Network deltas are
//     left undefined and the renderer skips the delta arrow.
//   * Cohort-attributed sub funnel at the CAMPAIGN level (the cohort
//     table's campaign attribution is unreliable per
//     queryGlobalComixCampaigns header comment). Per-campaign sub
//     fields are 0 with a documented caveat (better than fabricating).
//
// What changed in Phase 0:
//   * channelWeekly.history is now populated from ReadyData.history.
//     The analyst layer fires N parallel network-breakdown queries for
//     the trailing weeks; this file projects the rows down to the
//     renderer's HistoricalWeekRow shape and filters to the active
//     channel. Empty array when the caller doesn't pass history (e.g.
//     a unit test that builds a snapshot directly), preserving the
//     prior fallback behavior.

// ── Intent-channel <-> BQ-network mapping ─────────────────────────────
//
// Intent.channels uses the LLM-side enum ("meta", "google", "tiktok",
// "apple_search_ads", "applovin"); BQ NetworkRow.network is the
// human-readable label upstream sends ("Facebook" / "Google" /
// "TikTok" / "Apple"). The renderer's Channel type is yet another
// enum ("meta" / "google" / "tiktok" / "asa" / "search"). Three
// translation layers, mapped explicitly so a future enum drift fails
// loudly instead of silently.

type IntentChannel = Intent["channels"][number];
type ReportChannel = "meta" | "google" | "tiktok" | "asa" | "search";
type ReportPlatform = "android" | "ios" | "web";

const BQ_NETWORK_NAMES_FOR_CHANNEL: Record<IntentChannel, readonly string[]> = {
  meta: ["Meta", "Facebook"],
  google: ["Google", "Google Ads", "Google Ads ACI"],
  tiktok: ["TikTok"],
  apple_search_ads: ["Apple", "Apple Search Ads"],
  applovin: ["AppLovin"],
};

const REPORT_CHANNEL_FOR_INTENT: Record<IntentChannel, ReportChannel> = {
  meta: "meta",
  google: "google",
  tiktok: "tiktok",
  apple_search_ads: "asa",
  applovin: "search", // No dedicated AppLovin slot in the report schema; fall to "search".
};

const REPORT_LABEL_FOR_BQ_NETWORK: Record<string, string> = {
  Meta: "Facebook",
  Facebook: "Facebook",
  Google: "Google",
  "Google Ads": "Google",
  "Google Ads ACI": "Google",
  TikTok: "TikTok",
  Apple: "ASA",
  "Apple Search Ads": "ASA",
  AppLovin: "AppLovin",
};

export function reportChannelFromIntent(c: IntentChannel): ReportChannel {
  return REPORT_CHANNEL_FOR_INTENT[c];
}

function bqNetworkMatchesIntentChannel(
  bqNetwork: string,
  intentChannel: IntentChannel,
): boolean {
  return (BQ_NETWORK_NAMES_FOR_CHANNEL[intentChannel] ?? []).includes(
    bqNetwork,
  );
}

// ── Helpers ───────────────────────────────────────────────────────────

function round(n: number, digits = 2): number {
  if (!Number.isFinite(n)) return 0;
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

function pctDelta(current: number, baseline: number): number | undefined {
  if (!Number.isFinite(current) || !Number.isFinite(baseline)) return undefined;
  if (baseline === 0) return undefined;
  return round(((current - baseline) / baseline) * 100, 1);
}

function toneFromDelta(
  delta: number | undefined,
  goodIfNegative: boolean,
): "good" | "bad" | "neutral" {
  if (delta == null || delta === 0) return "neutral";
  if (goodIfNegative) {
    // Cost metric: a drop is good, a rise is bad.
    return delta < 0 ? "good" : "bad";
  }
  // Volume metric: a rise is good, a drop is bad.
  return delta > 0 ? "good" : "bad";
}

// ── BQ row -> WeeklySummaryRow ─────────────────────────────────────────

function networkRowToSummary(net: BQNetworkRow): WeeklySummaryRow {
  // The only period-over-period signal we have at the network level is
  // cpaD7 vs trailingCpaD7Avg (the 30-day prior baseline that
  // queryGlobalComixNetworkBreakdown already computes). Everything
  // else's delta is undefined: the renderer prints the value without
  // an arrow rather than inventing a movement.
  //
  // Cohort-maturity gate: when subD7 is below the maturity threshold,
  // cpaD7 from spend / subD7 is dominated by a tiny denominator and
  // produces values like $21k per acquisition on a $4k spend. The
  // renderer reads it as real and a CSM sees "catastrophic costs".
  // Suppress with `value: null, maturing: true` so the cell prints
  // as an em-dash. Same idea protects against the false-good case
  // when subD7 = 0 (cpaD7 collapses to 0 via SAFE_DIVIDE; without
  // this guard the delta would compute -100% and tone "good").
  const d7Mature = net.subD7 >= COHORT_D7_MATURITY_THRESHOLD;
  const cpaD7Delta = d7Mature
    ? pctDelta(net.cpaD7, net.trailingCpaD7Avg)
    : undefined;

  return {
    label: REPORT_LABEL_FOR_BQ_NETWORK[net.network] ?? net.network,
    spend: { value: round(net.spend, 0), tone: "neutral" },
    substart: { value: round(net.subStart, 0), tone: "neutral" },
    subD0: { value: round(net.subD0, 0), tone: "neutral" },
    subD7: { value: round(net.subD7, 0), tone: "neutral", maturing: true },
    cpSubstart: { value: round(net.cpSubStart, 2), tone: "neutral" },
    cpaD0: { value: round(net.cpaD0, 2), tone: "neutral" },
    cpaD7: {
      value: d7Mature ? round(net.cpaD7, 2) : null,
      delta: cpaD7Delta,
      tone: d7Mature ? toneFromDelta(cpaD7Delta, true) : "neutral",
      maturing: true,
    },
  };
}

function totalsFromNetworks(rows: BQNetworkRow[]): WeeklySummaryRow {
  const sum = (k: keyof Pick<
    BQNetworkRow,
    "spend" | "subStart" | "subD0" | "subD7"
  >): number => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0);
  const totalSpend = sum("spend");
  const totalSubstart = sum("subStart");
  const totalSubD0 = sum("subD0");
  const totalSubD7 = sum("subD7");
  const safe = (a: number, b: number) => (b > 0 ? a / b : 0);
  // Same cohort-maturity gate as the per-row case, applied to the
  // SUM of subD7. Stricter total threshold is unnecessary: if no
  // single network had >=10 conversions we'd already have suppressed
  // every row, so the total cell suppressing is the right echo.
  const d7Mature = totalSubD7 >= COHORT_D7_MATURITY_THRESHOLD;
  const totalCpaD7 = d7Mature ? safe(totalSpend, totalSubD7) : 0;
  const baselineRows = rows.filter((r) => r.trailingCpaD7Avg > 0);
  const trailingAvg =
    baselineRows.length > 0
      ? baselineRows.reduce((a, r) => a + r.trailingCpaD7Avg, 0) /
        baselineRows.length
      : 0;
  const totalCpaD7Delta = d7Mature
    ? pctDelta(totalCpaD7, trailingAvg)
    : undefined;
  return {
    label: "Total",
    spend: { value: round(totalSpend, 0), tone: "neutral" },
    substart: { value: round(totalSubstart, 0), tone: "neutral" },
    subD0: { value: round(totalSubD0, 0), tone: "neutral" },
    subD7: { value: round(totalSubD7, 0), tone: "neutral", maturing: true },
    cpSubstart: {
      value: round(safe(totalSpend, totalSubstart), 2),
      tone: "neutral",
    },
    cpaD0: { value: round(safe(totalSpend, totalSubD0), 2), tone: "neutral" },
    cpaD7: {
      value: d7Mature ? round(totalCpaD7, 2) : null,
      delta: totalCpaD7Delta,
      tone: d7Mature ? toneFromDelta(totalCpaD7Delta, true) : "neutral",
      maturing: true,
    },
  };
}

// ── WeeklyHistoryRow -> reports::HistoricalWeekRow ────────────────────
//
// The analyst layer surfaces per-(network, week) rows in
// ReadyData.history.networks. The renderer's ChannelWeeklySection wants
// the channel-scoped trailing rows in the HistoricalWeekRow shape (label
// + range + flat metric fields), ordered oldest-first. This projection
// filters by the requested BQ network labels and reshapes.
//
// The maturity gate stays consistent with the current-week renderer:
// when a week's subD7 is below COHORT_D7_MATURITY_THRESHOLD we surface
// the cohort fields as `null` (subD7 / cpaD7) so a CSM reads "—" rather
// than an artifact value.

function historyRowToHistorical(row: WeeklyHistoryRow): HistoricalWeekRow {
  const m = row.metrics;
  const d7Mature = m.subD7 >= COHORT_D7_MATURITY_THRESHOLD;
  // `label` and `range` map to the deck's "Week 17" / "20 Apr 2026 to
  // 26 Apr 2026" labels. We derive both from the row's own dates so the
  // output stays period-agnostic.
  const range = formatDateRange(row.weekIsoStart, row.weekIsoEnd);
  return {
    label: `Week ${row.weekNumber}`,
    range,
    spend: round(m.spend, 0),
    impressions: round(m.impressions, 0),
    clicks: round(m.clicks, 0),
    installs: round(m.installs, 0),
    cpi: round(m.cpi, 2),
    substart: round(m.subStart, 0),
    cpSubstart: round(m.cpSubStart, 2),
    subD0: round(m.subD0, 0),
    cpaD0: round(m.cpaD0, 2),
    subD7: d7Mature ? round(m.subD7, 0) : null,
    cpaD7: d7Mature ? round(m.cpaD7, 2) : null,
  };
}

function formatDateRange(isoStart: string, isoEnd: string): string {
  const fmt = (iso: string) => {
    const d = new Date(`${iso}T00:00:00Z`);
    return d.toLocaleDateString("en-US", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  };
  return `${fmt(isoStart)} to ${fmt(isoEnd)}`;
}

function projectChannelHistory(
  history: WeeklyHistoryRow[],
  intentChannel: IntentChannel | undefined,
): HistoricalWeekRow[] {
  if (intentChannel == null || history.length === 0) return [];
  const matches = history.filter((r) =>
    bqNetworkMatchesIntentChannel(r.network, intentChannel),
  );
  // Oldest-first so the renderer can stack the trailing rows above the
  // current week in chronological order.
  matches.sort((a, b) => a.weekIsoStart.localeCompare(b.weekIsoStart));
  return matches.map(historyRowToHistorical);
}

// ── BQ CampaignRow -> reports::CampaignRow ─────────────────────────────

function bqCampaignToReport(c: BQCampaignRow): ReportCampaignRow {
  // Note (trust contract): cohort-attributed sub-funnel does not join
  // reliably to the campaign_id, so the substart / subD0 / subD7
  // columns are not populated. Setting them to 0 would lie; leaving
  // them at 0 with this caveat in code is the lesser evil for the
  // first real-data cut. Renderer falls back to dashes for 0.
  return {
    campaignName: c.campaign_name,
    spend: round(c.spend, 0),
    installs: round(c.installs, 0),
    cpi: round(c.cpi, 2),
    substart: 0,
    cpSubstart: 0,
    cpSubstartDelta: 0,
    subD0: 0,
    cpaD0: 0,
    cpaD0Delta: 0,
    subD7: null,
    cpaD7: null,
    cpaD7Delta: null,
  };
}

// ── Public API ────────────────────────────────────────────────────────

export type SnapshotInputs = {
  intent: Intent;
  networks: BQNetworkRow[];
  campaigns: BQCampaignRow[];
  // trend retained in the signature for future per-week aggregation;
  // unused today.
  trend?: BQTrendPointByNetwork[];
  /** Trailing-week context from ReadyData.history.networks. Empty when
   *  the caller has no history (e.g. the analyst couldn't anchor the
   *  walk-back); the channel weekly section then renders with no
   *  trailing rows, same fallback as before. */
  history?: WeeklyHistoryRow[];
};

export function buildHermesSnapshot(args: SnapshotInputs): HermesSnapshot {
  const { intent, networks, campaigns } = args;
  const history = args.history ?? [];
  const client = findClient(intent.client);
  const intentChannel = intent.channels[0];

  // Networks present in BQ for the active period. We never substitute
  // a mock row for a missing network; an absent network just means the
  // client did not run on that channel this period.
  const platformRows = networks.map(networkRowToSummary);

  // Channel weekly slice: pick the single network row matching the
  // intent's primary channel. If BQ has nothing for that channel,
  // currentWeek stays null and the renderer omits the section.
  const channelMatch =
    intentChannel != null
      ? networks.find((n) =>
          bqNetworkMatchesIntentChannel(n.network, intentChannel),
        )
      : undefined;

  // Channel campaigns: filter the per-campaign rows to the matching
  // network. Skip when the intent has no channel or no campaigns
  // landed for it.
  const channelCampaigns =
    intentChannel != null
      ? campaigns.filter((c) =>
          bqNetworkMatchesIntentChannel(c.network, intentChannel),
        )
      : [];

  return {
    clientLabel: client.name,
    period: {
      label: intent.period.label,
      isoStart: intent.period.iso_start,
      isoEnd: intent.period.iso_end,
    },
    // TODO(workstream-D2): extend the BQ queries with a real platform
    // predicate (cohort _OS_name + campaign-name regex for the spend
    // tables that lack a uniform OS column). Until then every snapshot
    // is client-wide and the assembler omits platform claims from
    // section titles so the deck does not lie about scope.
    dataScope: "client-wide-all-platforms",
    platformOverall:
      platformRows.length > 0
        ? { rows: platformRows, total: totalsFromNetworks(networks) }
        : null,
    channelWeekly:
      channelMatch != null
        ? {
            currentWeek: networkRowToSummary(channelMatch),
            // Trailing weeks for the active channel, projected from
            // ReadyData.history.networks. Empty array when the caller
            // didn't pass `history` (back-compat for tests that build
            // a snapshot without going through getReadyData) or when
            // the BQ history fetch returned nothing for this channel.
            history: projectChannelHistory(history, intentChannel),
          }
        : null,
    channelCampaign:
      channelCampaigns.length > 0
        ? { rows: channelCampaigns.slice(0, 5).map(bqCampaignToReport) }
        : null,
  };
}
