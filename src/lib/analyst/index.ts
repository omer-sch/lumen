import "server-only";

import { findClient } from "@/lib/mock/clients";
import {
  queryGlobalComixCampaigns,
  queryGlobalComixDataAsOf,
  queryGlobalComixNetworkBreakdown,
  queryGlobalComixTrend,
} from "@/lib/globalcomix-queries";

import { runAnomstack } from "./anomstack";
import {
  deriveAnalystCacheKey,
  withAnalystCache,
} from "./cache";
import { enrichCampaignRow } from "./campaign-classifier";
import { cpaD7VsTrailing30d } from "./comparisons";
import { fetchTrailingWeeks } from "./history";
import { lookupKnowledge } from "./knowledge";
import { stampReadyDataProvenance } from "./provenance";
import { topCampaignsBySpend } from "./rankings";
import {
  ANALYST_QUERY_IDS,
  type Intent,
  type ReadyData,
} from "./types";

// Public API for the shared analyst. Every consumer of analytics data
// (Hermes when "live", manual reports from day one, future smart
// Reports component, notifications) calls getReadyData(intent).
//
// What it does, in order:
//   1. Resolve the period (ISO start / end) from the intent.
//   2. Cache lookup by (client, period, platforms, channels, focus).
//   3. On miss, fetch the BQ trio (networks, campaigns, trend) in
//      parallel, plus dataAsOf for freshness, plus knowledge (gated).
//   4. Run anomstack -> AnalystFinding[] (already maturity-gated and
//      provenance-stamped at the detector layer).
//   5. Run rankings (topCampaignsBySpend with partial flag).
//   6. Run comparisons (CPA D7 vs trailing 30-day baseline, honestly
//      named so a downstream LLM cannot cite "week-over-week" off a
//      30-day average).
//   7. Stamp ReadyData provenance (cacheKey, queryIds, bqCacheAgeSeconds).
//   8. Return ReadyData.
//
// Target latency: <500ms cache hit, <5s cache miss. The hot path is
// the BQ trio (each cache-warmed in <100ms; cold ~2s each), the
// anomstack run (single-digit ms), and the dataAsOf query (~50ms
// uncached). Knowledge is async-parallel with the BQ trio so it does
// not add to the critical path.

// Default to the last 7 days ending today UTC when an intent does not
// pass ISO bounds. Same behavior the existing Hermes analyze.ts had.
function resolvePeriod(intent: Intent): { isoStart: string; isoEnd: string } {
  const today = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const isoEnd = intent.period.iso_end ?? fmt(today);
  const isoStart =
    intent.period.iso_start ??
    fmt(new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000));
  return { isoStart, isoEnd };
}

// Approximate data-freshness in seconds. dataAsOf is at day granularity
// (YYYY-MM-DD); diffing against now gives a usable freshness signal
// that matters more for consumers than Redis-key age. Returns 0 when
// the freshness query fails so a transient warehouse outage does not
// block ReadyData.
function freshnessSeconds(dataAsOfIso: string | null): number {
  if (!dataAsOfIso) return 0;
  const t = Date.parse(`${dataAsOfIso}T00:00:00Z`);
  if (Number.isNaN(t)) return 0;
  const seconds = Math.floor((Date.now() - t) / 1000);
  return Math.max(0, seconds);
}

export async function getReadyData(intent: Intent): Promise<ReadyData> {
  const { isoStart, isoEnd } = resolvePeriod(intent);
  const cacheKeyStr = deriveAnalystCacheKey(intent);

  return withAnalystCache(intent, async () => {
    // Per-query BQ cache absorbs the warehouse latency; this layer
    // pays the analyst-computation cost only on miss. Knowledge and
    // trailing history are parallelised so they do not add to the
    // critical path.
    const [
      networks,
      rawCampaigns,
      trend,
      dataAsOf,
      knowledgeChunks,
      historyRows,
    ] = await Promise.all([
      queryGlobalComixNetworkBreakdown(intent.client, isoStart, isoEnd),
      queryGlobalComixCampaigns(intent.client, isoStart, isoEnd),
      queryGlobalComixTrend(intent.client, isoStart, isoEnd),
      queryGlobalComixDataAsOf(intent.client).catch(() => null),
      lookupKnowledge({ intent }),
      fetchTrailingWeeks({
        client: intent.client,
        periodIsoStart: isoStart,
      }).catch(() => []),
    ]);

    // Enrich campaign rows with family / geo / campaignType derived
    // from the GlobalComix naming convention. Pure regex; no extra BQ
    // round-trip. Names that don't match the pattern fall back to
    // {family: "Other", geo: "Unknown"} so the row still flows through.
    const campaigns = rawCampaigns.map(enrichCampaignRow);

    const anomstack = runAnomstack({
      networks,
      campaigns: rawCampaigns,
      periodIsoStart: isoStart,
      periodIsoEnd: isoEnd,
    });
    // Rankings consumes the raw shape (it only reads spend); we pass
    // the enriched array for type-safety. Property-compatible since
    // EnrichedCampaignRow widens CampaignRow.
    const rankings = { topCampaignsBySpend: topCampaignsBySpend(campaigns) };
    const comparisons = { cpaD7PoP: cpaD7VsTrailing30d(networks) };

    const provenance = stampReadyDataProvenance({
      queryIds: [
        ANALYST_QUERY_IDS.NETWORK_BREAKDOWN,
        ANALYST_QUERY_IDS.CAMPAIGNS,
        ANALYST_QUERY_IDS.TREND,
        ANALYST_QUERY_IDS.DATA_AS_OF,
      ],
      cacheKey: cacheKeyStr,
      bqCacheAgeSeconds: freshnessSeconds(dataAsOf),
    });

    const clientLabel = findClient(intent.client).name;

    const ready: ReadyData = {
      intent,
      clientLabel,
      period: {
        label: intent.period.label,
        isoStart,
        isoEnd,
      },
      networks,
      campaigns,
      trend,
      history: { networks: historyRows },
      anomalies: anomstack.findings,
      rankings,
      comparisons,
      knowledgeChunks,
      provenance,
    };

    return ready;
  });
}

// Public re-exports so consumers can import everything from
// "@/lib/analyst" (single entry point per the spec contract).
export type {
  AnalystFinding,
  AnalystFindingKind,
  AnalystFindingSeverity,
  AnomalyDetails,
  EnrichedCampaignRow,
  FindingProvenance,
  Intent,
  IntentChannel,
  IntentPlatform,
  KnowledgeChunk,
  PeriodOverPeriod,
  Rankings,
  ReadyData,
  ReadyDataProvenance,
  WeeklyHistoryRow,
} from "./types";
export { IntentSchema, ANALYST_QUERY_IDS } from "./types";
export {
  ANALYST_CACHE_TTL_MS,
  ANALYST_CACHE_TTL_SECONDS,
  deriveAnalystCacheKey,
  deriveAnalystCacheParams,
} from "./cache";
export {
  classifyCampaignName,
  enrichCampaignRow,
  type CampaignClassification,
} from "./campaign-classifier";
export { HISTORY_WEEKS, fetchTrailingWeeks } from "./history";
