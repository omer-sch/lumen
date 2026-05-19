"use client";

import { useEffect, useMemo, useState } from "react";

import {
  previousWindow,
  useGlobalFilters,
  windowDays,
} from "@/lib/filters/use-global-filters";

export type LifecycleDailyRow = {
  date: string;
  os: string;
  subs: number;
  churn: number;
  netSub: number;
};

export type LifecycleOsRow = { os: string; subs: number; share: number };

export type LifecycleNetSubPoint = { date: string; netSub: number };

export type LifecycleTotals = {
  subs: number;
  churn: number;
  netSub: number;
};

export type LifecycleSparkPoint = { date: string; value: number };

export type LifecycleDeltas = {
  /** Percent change in New Subs vs prior equal-length window. `null`
   *  when the prior window is empty (would produce a misleading 0%). */
  subs: number | null;
  churn: number | null;
  netSub: number | null;
};

export type LifecycleSparklines = {
  subs: LifecycleSparkPoint[];
  churn: LifecycleSparkPoint[];
  netSub: LifecycleSparkPoint[];
};

export type LifecycleData = {
  daily: LifecycleDailyRow[];
  osMix: LifecycleOsRow[];
  trend: LifecycleNetSubPoint[];
  totals: LifecycleTotals;
  deltas: LifecycleDeltas;
  /** Per-day series rolled up across OS — used for the KPI sparklines. */
  sparklines: LifecycleSparklines;
  /** Inclusive length of the active window in days. Drives the
   *  line-vs-bar decision in NetSubTrend. */
  windowDays: number;
  loading: boolean;
  error: boolean;
};

const TOTAL_SUBS = "/api/bq/total-subs";

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`${r.status}`);
  return (await r.json()) as T;
}

/**
 * Roll up a multi-OS daily row list into a per-day series. Lifecycle
 * tile sparklines and the Net Sub trend both want "one number per day"
 * regardless of OS, so we sum across OS rows for the same date and
 * preserve insertion order.
 */
function rollupByDate(
  rows: LifecycleDailyRow[],
  pick: (r: LifecycleDailyRow) => number,
): LifecycleSparkPoint[] {
  const map = new Map<string, number>();
  for (const r of rows) {
    map.set(r.date, (map.get(r.date) ?? 0) + pick(r));
  }
  return [...map.entries()].map(([date, value]) => ({ date, value }));
}

function totalsFrom(rows: LifecycleDailyRow[]): LifecycleTotals {
  return rows.reduce<LifecycleTotals>(
    (acc, r) => {
      acc.subs += r.subs;
      acc.churn += r.churn;
      acc.netSub += r.netSub;
      return acc;
    },
    { subs: 0, churn: 0, netSub: 0 },
  );
}

/**
 * Period-over-period delta as a percentage. Returns `null` when the
 * prior period is zero (or sub-zero) so KpiCard renders the muted "—"
 * pill instead of "Infinity%" or a misleading "+100%".
 */
function pctDelta(current: number, prior: number): number | null {
  if (!Number.isFinite(prior) || prior === 0) return null;
  return ((current - prior) / Math.abs(prior)) * 100;
}

const EMPTY_DATA: LifecycleData = {
  daily: [],
  osMix: [],
  trend: [],
  totals: { subs: 0, churn: 0, netSub: 0 },
  deltas: { subs: null, churn: null, netSub: null },
  sparklines: { subs: [], churn: [], netSub: [] },
  windowDays: 0,
  loading: true,
  error: false,
};

/**
 * Single source for everything the Lifecycle tab renders. Fetches the
 * current period (daily + os-mix + net-sub-trend) and the prior
 * equal-length window so each KPI tile can show a period-over-period
 * delta — the only piece of state the old SubscriberLifecycle didn't
 * already have.
 *
 * Note: lifecycle data intentionally ignores the global OS filter. The
 * dwh_total_subs query returns all OS regardless and the OS chip
 * unmounts from the TopBar on this tab (see CLAUDE.md, Lifecycle).
 */
export function useLifecycleData(): LifecycleData {
  const filters = useGlobalFilters();
  const { from, to, client } = filters;
  const fromIso = from.toISOString().slice(0, 10);
  const toIso = to.toISOString().slice(0, 10);

  const prior = useMemo(() => previousWindow(filters), [filters]);
  const prevFromIso = prior.from.toISOString().slice(0, 10);
  const prevToIso = prior.to.toISOString().slice(0, 10);
  const days = useMemo(() => windowDays(filters), [filters]);

  const [daily, setDaily] = useState<LifecycleDailyRow[]>([]);
  const [osMix, setOsMix] = useState<LifecycleOsRow[]>([]);
  const [trend, setTrend] = useState<LifecycleNetSubPoint[]>([]);
  const [priorDaily, setPriorDaily] = useState<LifecycleDailyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);

    const cur = `client=${encodeURIComponent(client)}&from=${fromIso}&to=${toIso}`;
    const prev = `client=${encodeURIComponent(client)}&from=${prevFromIso}&to=${prevToIso}`;

    Promise.all([
      fetchJson<LifecycleDailyRow[]>(`${TOTAL_SUBS}?${cur}`),
      fetchJson<LifecycleOsRow[]>(`${TOTAL_SUBS}?${cur}&view=os-mix`),
      fetchJson<LifecycleNetSubPoint[]>(`${TOTAL_SUBS}?${cur}&view=net-sub-trend`),
      fetchJson<LifecycleDailyRow[]>(`${TOTAL_SUBS}?${prev}`),
    ])
      .then(([d, m, t, pd]) => {
        if (cancelled) return;
        setDaily(Array.isArray(d) ? d : []);
        setOsMix(Array.isArray(m) ? m : []);
        setTrend(Array.isArray(t) ? t : []);
        setPriorDaily(Array.isArray(pd) ? pd : []);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError(true);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [client, fromIso, toIso, prevFromIso, prevToIso]);

  const totals = useMemo(() => totalsFrom(daily), [daily]);
  const priorTotals = useMemo(() => totalsFrom(priorDaily), [priorDaily]);

  const deltas: LifecycleDeltas = useMemo(
    () => ({
      subs: pctDelta(totals.subs, priorTotals.subs),
      churn: pctDelta(totals.churn, priorTotals.churn),
      netSub: pctDelta(totals.netSub, priorTotals.netSub),
    }),
    [totals, priorTotals],
  );

  const sparklines: LifecycleSparklines = useMemo(
    () => ({
      subs: rollupByDate(daily, (r) => r.subs),
      churn: rollupByDate(daily, (r) => r.churn),
      netSub: rollupByDate(daily, (r) => r.netSub),
    }),
    [daily],
  );

  if (loading && daily.length === 0) {
    return { ...EMPTY_DATA, windowDays: days, loading: true };
  }

  return {
    daily,
    osMix,
    trend,
    totals,
    deltas,
    sparklines,
    windowDays: days,
    loading,
    error,
  };
}
