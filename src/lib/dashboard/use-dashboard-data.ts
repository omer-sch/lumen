"use client";

import { useEffect, useRef, useState } from "react";
import { formatKpi } from "@/lib/format";
import { getClientApiBase } from "@/lib/mock/clients";
import type {
  BQTrendPoint,
  ChannelBreakdown,
  DashboardData,
  DataBounds,
  KPIData,
  TrendPoint,
} from "@/types/dashboard";

type Args = {
  /** Inclusive UTC start of the active window. */
  from: Date;
  to: Date;
  /** Client slug from `useGlobalFilters`. */
  client: string;
};

type State = {
  data: DashboardData | null;
  loading: boolean;
  error: string | null;
  /** Earliest/latest dates with spend > 0 for the active client. Surfaced so
   *  the dashboard can auto-snap the global window onto data when the user
   *  has selected a range that's entirely empty. `null` until the first
   *  bounds fetch resolves. */
  bounds: DataBounds | null;
  /** True when the active window has zero spend — used together with
   *  `bounds` to decide whether to auto-snap. */
  windowEmpty: boolean;
};

const toISODate = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Drives the `/dashboard` data layer. Fetches the three BQ-backed views in
 * parallel and shapes them into the `DashboardData` the page components
 * consume. On error or while loading, `data` is `null` — the UI is
 * responsible for rendering a skeleton or error state. There is no
 * fallback to fake numbers: if BQ is unavailable, the user sees that.
 */
export function useDashboardData({ from, to, client }: Args): State {
  const fromIso = toISODate(from);
  const toIso = toISODate(to);

  const [state, setState] = useState<State>({
    data: null,
    loading: true,
    error: null,
    bounds: null,
    windowEmpty: false,
  });

  // Avoid setState after unmount when the user navigates fast.
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();

    setState((cur) => ({
      data: null,
      loading: true,
      error: null,
      // Preserve bounds across window-only refetches so the auto-snap effect
      // doesn't lose its reference between renders. They'll be overwritten
      // by the bounds fetch below if the response shape changes.
      bounds: cur.bounds,
      windowEmpty: false,
    }));

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const qs = new URLSearchParams({ client, from: fromIso, to: toIso });
    const boundsQs = new URLSearchParams({ client });
    // Agent-strategy clients hit `/api/bq/*`; lumen-union clients (100play,
    // …) route through `/api/bq/<slug>/*` so the per-client query module is
    // reached. The hook stays branchless — `apiBase` carries the choice.
    const apiBase = getClientApiBase(client);
    Promise.all([
      fetchJson<KPIData>(`${apiBase}/dashboard-kpis?${qs}`, ctrl.signal),
      fetchJson<BQTrendPoint[]>(`${apiBase}/trend?${qs}`, ctrl.signal),
      fetchJson<ChannelBreakdown[]>(`${apiBase}/channel-mix?${qs}`, ctrl.signal),
      fetchJson<DataBounds>(`${apiBase}/data-bounds?${boundsQs}`, ctrl.signal),
    ])
      .then(([kpis, trend, channelMix, bounds]) => {
        setState({
          data: mergeBqIntoDashboard({ kpis, trend, channelMix, from, to }),
          loading: false,
          error: null,
          bounds,
          windowEmpty: !(kpis.spend > 0),
        });
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        const message = err instanceof Error ? err.message : "Unknown error";
        setState({
          data: null,
          loading: false,
          error: message,
          bounds: null,
          windowEmpty: false,
        });
      });

    return () => ctrl.abort();
    // We don't include `from`/`to` Date objects directly — their ISO strings
    // are the stable identity that should trigger a refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, fromIso, toIso]);

  return state;
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
  from: Date;
  to: Date;
}): DashboardData {
  const { kpis, trend, channelMix, from, to } = args;
  const days = Math.max(
    1,
    Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1,
  );
  const periodLabel = `vs prev ${days}d`;
  const ROAS_TARGET = 1.3;
  // Preserve `null` so a missing prior period renders as "—" in KpiCard
  // instead of a misleading "+0.0%".
  const toPct = (frac: number | null): number | null =>
    frac == null ? null : +(frac * 100).toFixed(1);

  // Match the trend shape consumed by TrendChart: MM-DD on the x-axis.
  const trendOut: TrendPoint[] = trend.map((p) => ({
    date: p.date.slice(5, 10),
    spend: Math.round(p.spend),
    installs: Math.round(p.installs),
    cpi: +p.cpi.toFixed(2),
    roas: +p.roas.toFixed(2),
  }));

  // Channel mix shape: { channel, spend, pct } with pct 0..100. `share` is
  // always populated (computed in SQL), so `toPct` is forced non-null here.
  const cm = channelMix.map((c) => ({
    channel: c.network,
    spend: Math.round(c.spend),
    pct: toPct(c.share) ?? 0,
  }));

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
        id: "cpi",
        label: "CPI",
        value: formatKpi.cpi(kpis.cpi),
        delta: toPct(kpis.cpiDelta),
        direction: "lower-better",
        hint: "lower is better",
      },
      {
        id: "roas",
        label: "ROAS (D7)",
        value: formatKpi.ratio(kpis.roas),
        delta: toPct(kpis.roasDelta),
        direction: "higher-better",
        hint: `vs target ${ROAS_TARGET.toFixed(2)}x`,
      },
    ],
    trend: trendOut,
    channelMix: cm,
  };
}
