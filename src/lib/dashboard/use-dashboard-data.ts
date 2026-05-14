"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatKpi } from "@/lib/format";
import { getClientApiBase } from "@/lib/mock/clients";
import type {
  BQTrendPoint,
  ChannelBreakdown,
  DashboardData,
  DataBounds,
  KPIData,
  NetworkRow,
  PaybackPoint,
  TrendPoint,
} from "@/types/dashboard";

type Args = {
  /** Inclusive UTC start of the active window. */
  from: Date;
  to: Date;
  /** Client slug from `useGlobalFilters`. */
  client: string;
};

/**
 * Per-section error label. `null` when that section's fetch is in flight
 * or succeeded, a short string when it failed. The UI renders one
 * `SectionError` per non-null entry instead of breaking the whole page.
 */
export type SectionErrors = {
  kpis: string | null;
  trend: string | null;
  channelMix: string | null;
};

type State = {
  /** Composed dashboard view. `null` until at least the KPI fetch
   *  resolves — the page can't render meaningfully without KPI numbers.
   *  When KPIs succeed but trend / channelMix fail, those fields are
   *  empty arrays and the corresponding SectionError mounts in place. */
  data: DashboardData | null;
  loading: boolean;
  errors: SectionErrors;
  bounds: DataBounds | null;
  windowEmpty: boolean;
  /** Bump to force a refetch (used by SectionError retry buttons). */
  refetch: () => void;
};

const toISODate = (d: Date) => d.toISOString().slice(0, 10);

const NO_ERRORS: SectionErrors = { kpis: null, trend: null, channelMix: null };

/**
 * Drives the `/dashboard` data layer. Fires the four BQ-backed requests
 * in parallel and reports them with `Promise.allSettled` so a partial
 * failure surfaces section-by-section instead of nuking the whole page.
 *
 * `data` is only `null` while the first KPI fetch is in flight or the
 * KPI fetch itself failed. Trend / channel mix failures show as empty
 * arrays — the page renders the other tiles plus a `SectionError`
 * placeholder for the failed slot.
 */
export function useDashboardData({ from, to, client }: Args): State {
  const fromIso = toISODate(from);
  const toIso = toISODate(to);

  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState<State>({
    data: null,
    loading: true,
    errors: NO_ERRORS,
    bounds: null,
    windowEmpty: false,
    // Filled in below — placeholder for the initial state shape.
    refetch: () => undefined,
  });

  // Avoid setState after unmount when the user navigates fast.
  const abortRef = useRef<AbortController | null>(null);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    abortRef.current?.abort();

    setState((cur) => ({
      ...cur,
      data: null,
      loading: true,
      errors: NO_ERRORS,
      windowEmpty: false,
      refetch,
    }));

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const qs = new URLSearchParams({ client, from: fromIso, to: toIso });
    const boundsQs = new URLSearchParams({ client });
    // Agent-strategy clients hit `/api/bq/*`; lumen-union clients (100play,
    // …) route through `/api/bq/<slug>/*` so the per-client query module is
    // reached. The hook stays branchless — `apiBase` carries the choice.
    const apiBase = getClientApiBase(client);

    Promise.allSettled([
      fetchJson<KPIData>(`${apiBase}/dashboard-kpis?${qs}`, ctrl.signal),
      fetchJson<BQTrendPoint[]>(`${apiBase}/trend?${qs}`, ctrl.signal),
      fetchJson<ChannelBreakdown[]>(`${apiBase}/channel-mix?${qs}`, ctrl.signal),
      fetchJson<DataBounds>(`${apiBase}/data-bounds?${boundsQs}`, ctrl.signal),
      fetchJson<NetworkRow[]>(`${apiBase}/network-breakdown?${qs}`, ctrl.signal),
      fetchJson<PaybackPoint[]>(`${apiBase}/payback?${qs}`, ctrl.signal),
    ]).then((results) => {
      if (ctrl.signal.aborted) return;
      const [kpisR, trendR, channelMixR, boundsR, networkR, paybackR] = results;

      const errors: SectionErrors = {
        kpis: kpisR.status === "rejected" ? errMsg(kpisR.reason) : null,
        trend: trendR.status === "rejected" ? errMsg(trendR.reason) : null,
        channelMix:
          channelMixR.status === "rejected" ? errMsg(channelMixR.reason) : null,
      };

      // KPI failure is structural — without those numbers the dashboard
      // has no story to tell, so `data` stays null and `MyDashboard`
      // mounts a KPI-section error in place of the strip + the partials.
      if (kpisR.status === "rejected") {
        setState({
          data: null,
          loading: false,
          errors,
          bounds: boundsR.status === "fulfilled" ? boundsR.value : null,
          windowEmpty: false,
          refetch,
        });
        return;
      }

      const kpis = kpisR.value;
      const trend = trendR.status === "fulfilled" ? trendR.value : [];
      const channelMix =
        channelMixR.status === "fulfilled" ? channelMixR.value : [];
      // Network breakdown + payback don't get their own SectionErrors —
      // they degrade silently to empty arrays (UI hides those slots
      // instead of mounting an error placeholder), because they're
      // additive context rather than load-bearing.
      const networkBreakdown =
        networkR.status === "fulfilled" ? networkR.value : [];
      const payback = paybackR.status === "fulfilled" ? paybackR.value : [];

      setState({
        data: mergeBqIntoDashboard({
          kpis,
          trend,
          channelMix,
          networkBreakdown,
          payback,
          from,
          to,
        }),
        loading: false,
        errors,
        bounds: boundsR.status === "fulfilled" ? boundsR.value : null,
        windowEmpty: !(kpis.spend > 0),
        refetch,
      });
    });

    return () => ctrl.abort();
    // We don't include `from`/`to` Date objects directly — their ISO strings
    // are the stable identity that should trigger a refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, fromIso, toIso, nonce, refetch]);

  return state;
}

function errMsg(err: unknown): string {
  return err instanceof Error ? err.message : "Unknown error";
}

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal, cache: "no-store" });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return (await res.json()) as T;
}

// ── BQ → UI DashboardData translation ──────────────────────────────────────

function mergeBqIntoDashboard(args: {
  kpis: KPIData;
  trend: BQTrendPoint[];
  channelMix: ChannelBreakdown[];
  networkBreakdown: NetworkRow[];
  payback: PaybackPoint[];
  from: Date;
  to: Date;
}): DashboardData {
  const { kpis, trend, channelMix, networkBreakdown, payback, from, to } = args;
  const days = Math.max(
    1,
    Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1,
  );
  const periodLabel = `vs prev ${days}d`;
  const ROAS_TARGET = 1.3;
  // Preserve `null` so a missing prior period renders as "—" in KpiCard
  // instead of a misleading "+0.0%".
  const toPct = (frac: number | null | undefined): number | null =>
    frac == null ? null : +(frac * 100).toFixed(1);

  // Match the trend shape consumed by TrendChart: MM-DD on the x-axis.
  // Extended metrics fall back to 0 when the source didn't populate them
  // (agent-strategy clients) — the chart still renders, just flat.
  const trendOut: TrendPoint[] = trend.map((p) => ({
    date: p.date.slice(5, 10),
    spend: Math.round(p.spend),
    installs: Math.round(p.installs),
    clicks: p.clicks != null ? Math.round(p.clicks) : 0,
    impressions: p.impressions != null ? Math.round(p.impressions) : 0,
    ftdD7: p.ftdD7 != null ? Math.round(p.ftdD7) : 0,
    cpi: +p.cpi.toFixed(2),
    roas: +p.roas.toFixed(2),
    ctr: p.ctr != null ? +p.ctr.toFixed(4) : 0,
    cpm: p.cpm != null ? +p.cpm.toFixed(2) : 0,
    cpc: p.cpc != null ? +p.cpc.toFixed(2) : 0,
    revD7: p.revD7 != null ? Math.round(p.revD7) : 0,
    revD30: p.revD30 != null ? Math.round(p.revD30) : 0,
    roasD14: p.roasD14 != null ? +p.roasD14.toFixed(3) : 0,
    roasD30: p.roasD30 != null ? +p.roasD30.toFixed(3) : 0,
    roasD90: p.roasD90 != null ? +p.roasD90.toFixed(3) : 0,
    retD7: p.retD7 != null ? +p.retD7.toFixed(4) : 0,
    payersD7: p.payersD7 != null ? Math.round(p.payersD7) : 0,
  }));

  // Channel mix shape: { channel, spend, pct } with pct 0..100. `share` is
  // always populated (computed in SQL), so `toPct` is forced non-null here.
  // Drop $0 networks: a row showing "0.0% · $0" is noise, not information.
  const cm = channelMix
    .filter((c) => c.spend > 0)
    .map((c) => ({
      channel: c.network,
      spend: Math.round(c.spend),
      pct: toPct(c.share) ?? 0,
    }));

  // Helper that returns 0 for nullish values — multi-source clients
  // populate every field, agent-strategy clients leave most undefined.
  const v = (x: number | undefined): number => x ?? 0;

  return {
    kpis: [
      {
        id: "spend",
        label: "Spend",
        value: formatKpi.money(Math.round(kpis.spend)),
        delta: toPct(kpis.spendDelta),
        direction: "higher-better",
        hint: periodLabel,
      },
      {
        id: "installs",
        label: "Installs",
        value: formatKpi.count(Math.round(kpis.installs)),
        delta: toPct(kpis.installsDelta),
        direction: "higher-better",
        hint: periodLabel,
      },
      {
        id: "clicks",
        label: "Clicks",
        value: formatKpi.count(Math.round(v(kpis.clicks))),
        delta: toPct(kpis.clicksDelta),
        direction: "higher-better",
        hint: "raw click volume",
      },
      {
        id: "impressions",
        label: "Impressions",
        value: formatKpi.count(Math.round(v(kpis.impressions))),
        delta: toPct(kpis.impressionsDelta),
        direction: "higher-better",
        hint: "raw impression volume",
      },
      {
        id: "cpi",
        label: "CPI",
        value: formatKpi.cpi(kpis.cpi),
        delta: toPct(kpis.cpiDelta),
        direction: "lower-better",
        hint: "lower is better",
      },
      {
        id: "ctr",
        label: "CTR",
        value: formatKpi.percent(v(kpis.ctr)),
        delta: toPct(kpis.ctrDelta),
        direction: "higher-better",
        hint: "clicks per impression",
      },
      {
        id: "cpm",
        label: "CPM",
        value: formatKpi.moneyCents(v(kpis.cpm)),
        delta: toPct(kpis.cpmDelta),
        direction: "lower-better",
        hint: "cost per 1k impressions",
      },
      {
        id: "cpc",
        label: "CPC",
        value: formatKpi.moneyCents(v(kpis.cpc)),
        delta: toPct(kpis.cpcDelta),
        direction: "lower-better",
        hint: "cost per click",
      },
      {
        id: "revD7",
        label: "Revenue D7",
        value: formatKpi.money(Math.round(v(kpis.revD7))),
        delta: toPct(kpis.revD7Delta),
        direction: "higher-better",
        hint: "cohort revenue, D7",
      },
      {
        id: "revD30",
        label: "Revenue D30",
        value: formatKpi.money(Math.round(v(kpis.revD30))),
        delta: toPct(kpis.revD30Delta),
        direction: "higher-better",
        hint: "cohort revenue, D30",
      },
      {
        id: "roas",
        label: "ROAS D7",
        value: formatKpi.ratio(kpis.roas),
        delta: toPct(kpis.roasDelta),
        direction: "higher-better",
        hint: `vs target ${ROAS_TARGET.toFixed(2)}x`,
      },
      {
        id: "roasD14",
        label: "ROAS D14",
        value: formatKpi.ratio(v(kpis.roasD14)),
        delta: toPct(kpis.roasD14Delta),
        direction: "higher-better",
        hint: "cohort D14",
      },
      {
        id: "roasD30",
        label: "ROAS D30",
        value: formatKpi.ratio(v(kpis.roasD30)),
        delta: toPct(kpis.roasD30Delta),
        direction: "higher-better",
        hint: "cohort D30",
      },
      {
        id: "roasD90",
        label: "ROAS D90",
        value: formatKpi.ratio(v(kpis.roasD90)),
        delta: toPct(kpis.roasD90Delta),
        direction: "higher-better",
        hint: "cohort D90 (matures slowly)",
      },
      {
        id: "retD7",
        label: "Retention D7",
        value: formatKpi.percent(v(kpis.retD7)),
        delta: toPct(kpis.retD7Delta),
        direction: "higher-better",
        hint: "users returning by D7",
      },
      {
        id: "payersD7",
        label: "Payers D7",
        value: formatKpi.count(v(kpis.payersD7)),
        delta: toPct(kpis.payersD7Delta),
        direction: "higher-better",
        hint: "first-week payers",
      },
      {
        id: "ftdD7",
        label: "FTD D7",
        value: formatKpi.count(v(kpis.ftdD7)),
        delta: toPct(kpis.ftdD7Delta),
        direction: "higher-better",
        hint: "first-time deposits, D7",
      },
    ],
    trend: trendOut,
    channelMix: cm,
    networkBreakdown,
    payback,
  };
}
