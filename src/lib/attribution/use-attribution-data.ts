"use client";

import { useEffect, useMemo, useState } from "react";

import {
  previousWindow,
  useGlobalFilters,
} from "@/lib/filters/use-global-filters";

type GeoRow = {
  sub_d7?: number;
  sub_paid?: number;
  sub_organic?: number;
};

type KpiPayload = { spend?: number };

export type AttributionTotals = {
  /** Total cohort-attributed subscribers (paid + organic). */
  subTotal: number;
  paid: number;
  organic: number;
  /** Paid spend in the active window (from dashboard-kpis). */
  spend: number;
};

export type AttributionData = {
  totals: AttributionTotals;
  /** BCAC = spend / subTotal. `null` when either side is zero (so KpiCard
   *  renders the muted "—" placeholder instead of "Infinity" or "$0.00"). */
  bcac: number | null;
  /** Percent change vs the same-length prior window. `null` when the prior
   *  BCAC is unavailable (zero spend or zero subs in the prior window). */
  bcacDelta: number | null;
  loading: boolean;
  error: boolean;
};

async function fetchJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`${r.status}`);
  return (await r.json()) as T;
}

function sumGeo(rows: GeoRow[]): { subTotal: number; paid: number; organic: number } {
  return rows.reduce(
    (acc, r) => {
      acc.subTotal += r.sub_d7 ?? 0;
      acc.paid += r.sub_paid ?? 0;
      acc.organic += r.sub_organic ?? 0;
      return acc;
    },
    { subTotal: 0, paid: 0, organic: 0 },
  );
}

function bcacOf(spend: number, subTotal: number): number | null {
  if (!(spend > 0) || !(subTotal > 0)) return null;
  return spend / subTotal;
}

function pctDelta(current: number | null, prior: number | null): number | null {
  if (current == null || prior == null) return null;
  if (!Number.isFinite(prior) || prior === 0) return null;
  return ((current - prior) / Math.abs(prior)) * 100;
}

const EMPTY: AttributionData = {
  totals: { subTotal: 0, paid: 0, organic: 0, spend: 0 },
  bcac: null,
  bcacDelta: null,
  loading: true,
  error: false,
};

/**
 * Single source for everything the Attribution tab renders. Consolidates
 * the two fetches that the legacy BcacHeadline + PaidVsOrganic pair each
 * did separately, plus a second pass against the prior window so BcacHero
 * can show a period-over-period delta on the BCAC headline.
 *
 * Endpoints (no new BQ work — reuses existing routes with prior dates):
 *   /api/bq/geo            — cohort subs per country, paid + organic split
 *   /api/bq/dashboard-kpis — aggregate spend in the window
 */
export function useAttributionData(): AttributionData {
  const filters = useGlobalFilters();
  const { from, to, client, os, platforms } = filters;
  const fromIso = from.toISOString().slice(0, 10);
  const toIso = to.toISOString().slice(0, 10);

  const prior = useMemo(() => previousWindow(filters), [filters]);
  const prevFromIso = prior.from.toISOString().slice(0, 10);
  const prevToIso = prior.to.toISOString().slice(0, 10);

  const platformsKey = platforms.join(",");

  const [data, setData] = useState<AttributionData>(EMPTY);

  useEffect(() => {
    let cancelled = false;
    setData((d) => ({ ...d, loading: true, error: false }));

    const buildQs = (rangeFrom: string, rangeTo: string) => {
      const p = new URLSearchParams({ client, from: rangeFrom, to: rangeTo });
      if (os !== "total") p.set("os", os);
      if (platforms.length > 0) p.set("platforms", platforms.join(","));
      return p.toString();
    };

    const curQs = buildQs(fromIso, toIso);
    const prevQs = buildQs(prevFromIso, prevToIso);

    Promise.all([
      fetchJson<GeoRow[]>(`/api/bq/geo?${curQs}`),
      fetchJson<KpiPayload>(`/api/bq/dashboard-kpis?${curQs}`),
      fetchJson<GeoRow[]>(`/api/bq/geo?${prevQs}`),
      fetchJson<KpiPayload>(`/api/bq/dashboard-kpis?${prevQs}`),
    ])
      .then(([curGeo, curKpis, prevGeo, prevKpis]) => {
        if (cancelled) return;
        const cur = sumGeo(Array.isArray(curGeo) ? curGeo : []);
        const curSpend = typeof curKpis?.spend === "number" ? curKpis.spend : 0;
        const prev = sumGeo(Array.isArray(prevGeo) ? prevGeo : []);
        const prevSpend = typeof prevKpis?.spend === "number" ? prevKpis.spend : 0;

        const bcac = bcacOf(curSpend, cur.subTotal);
        const prevBcac = bcacOf(prevSpend, prev.subTotal);

        setData({
          totals: { ...cur, spend: curSpend },
          bcac,
          bcacDelta: pctDelta(bcac, prevBcac),
          loading: false,
          error: false,
        });
      })
      .catch(() => {
        if (cancelled) return;
        setData({ ...EMPTY, loading: false, error: true });
      });

    return () => {
      cancelled = true;
    };
  }, [client, fromIso, toIso, prevFromIso, prevToIso, os, platformsKey, platforms]);

  return data;
}
