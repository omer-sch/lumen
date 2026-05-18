"use client";

import { useEffect, useState } from "react";

import { EmptyState } from "@/components/ui/EmptyState";
import { GlassCard } from "@/components/ui/GlassCard";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { PaidVsOrganicSkeleton } from "@/components/ui/Skeleton";
import { useGlobalFilters } from "@/lib/filters/use-global-filters";

type GeoRow = {
  country_code: string;
  country_name: string;
  spend: number;
  sub_d7: number;
  sub_paid: number;
  sub_organic: number;
};

const fmtCount = (n: number) => Math.round(n).toLocaleString();

/**
 * Paid vs Organic (WS3.D reshape - BCAC moved out).
 *
 * After the three-tab IA shipped, BCAC graduated into its own hero
 * KpiCard on the Attribution tab (BcacHeadline). PaidVsOrganic now
 * sticks to its core question: of all the subscribers that arrived in
 * this window, how many came via paid spend and how many came organic?
 *
 * Layout:
 *   - Three compact KpiCards: Sub Total / Sub Paid / Sub Organic
 *   - A horizontal share bar below that visualizes the same split
 *
 * The Organic bucket is opted in on the /api/bq/geo cohort - this is
 * one of the few queries that includes Organic in totals. Everywhere
 * else the dashboard stays paid-only.
 */
export function PaidVsOrganic() {
  const { from, to, client } = useGlobalFilters();
  const fromIso = from.toISOString().slice(0, 10);
  const toIso = to.toISOString().slice(0, 10);

  const [rows, setRows] = useState<GeoRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const qs = `client=${encodeURIComponent(client)}&from=${fromIso}&to=${toIso}`;
    fetch(`/api/bq/geo?${qs}`)
      .then((r) => r.json())
      .then((geo: GeoRow[]) => {
        if (cancelled) return;
        setRows(Array.isArray(geo) ? geo : []);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client, fromIso, toIso]);

  if (loading) return <PaidVsOrganicSkeleton />;
  if (rows.length === 0) {
    return (
      <GlassCard className="flex flex-col gap-3 p-4">
        <header className="flex items-baseline justify-between gap-2">
          <h3 className="font-display text-lg font-bold text-cloud-white">
            Paid vs Organic
          </h3>
          <p className="font-body text-xs text-[color:var(--text-muted)]">
            Cohort-attributed subs in the active window.
          </p>
        </header>
        <EmptyState
          title="No paid or organic subs in this window."
          description="Try widening the date range or removing the platform filter."
          bulbSize={88}
        />
      </GlassCard>
    );
  }

  const totals = rows.reduce(
    (acc, r) => {
      acc.subD7 += r.sub_d7 ?? 0;
      acc.paid += r.sub_paid ?? 0;
      acc.organic += r.sub_organic ?? 0;
      return acc;
    },
    { subD7: 0, paid: 0, organic: 0 },
  );
  const total = totals.paid + totals.organic;
  const paidPct = total > 0 ? totals.paid / total : 0;
  const organicPct = total > 0 ? totals.organic / total : 0;

  return (
    <GlassCard className="flex flex-col gap-4 p-5" enterIndex={3}>
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="font-display text-lg font-bold text-cloud-white">
          Paid vs Organic
        </h3>
        <p className="font-body text-xs text-[color:var(--text-muted)]">
          Cohort-attributed subs in the active window.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <KpiCard
          id="paid-vs-organic-sub-total"
          label="Sub Total"
          value={fmtCount(totals.subD7)}
          delta={null}
          direction="higher-better"
          size="compact"
          enterIndex={1}
        />
        <KpiCard
          id="paid-vs-organic-sub-paid"
          label="Sub Paid"
          value={fmtCount(totals.paid)}
          delta={null}
          direction="higher-better"
          size="compact"
          enterIndex={2}
        />
        <KpiCard
          id="paid-vs-organic-sub-organic"
          label="Sub Organic"
          value={fmtCount(totals.organic)}
          delta={null}
          direction="higher-better"
          size="compact"
          enterIndex={3}
        />
      </div>

      <SplitBar paidPct={paidPct} organicPct={organicPct} />
    </GlassCard>
  );
}

/**
 * Two-tone share bar showing paid vs organic ratio at a glance. The
 * KPI tiles above carry the absolute counts; this carries the shape.
 */
function SplitBar({
  paidPct,
  organicPct,
}: {
  paidPct: number;
  organicPct: number;
}) {
  if (paidPct === 0 && organicPct === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between font-body text-[11px] uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-2 w-2 rounded-full"
            style={{
              background: "var(--color-ua)",
              boxShadow: "0 0 6px var(--color-ua)",
            }}
          />
          Paid · {(paidPct * 100).toFixed(0)}%
        </span>
        <span className="inline-flex items-center gap-1.5">
          Organic · {(organicPct * 100).toFixed(0)}%
          <span
            aria-hidden
            className="inline-block h-2 w-2 rounded-full"
            style={{
              background: "var(--color-organic)",
              boxShadow: "0 0 6px var(--color-organic)",
            }}
          />
        </span>
      </div>
      <div
        className="flex h-2 w-full overflow-hidden rounded-full"
        role="img"
        aria-label={`Paid ${(paidPct * 100).toFixed(0)}%, Organic ${(organicPct * 100).toFixed(0)}%`}
      >
        <div
          className="h-full transition-[width] duration-700 ease-out-quart"
          style={{
            width: `${paidPct * 100}%`,
            background: "var(--color-ua)",
          }}
        />
        <div
          className="h-full transition-[width] duration-700 ease-out-quart"
          style={{
            width: `${organicPct * 100}%`,
            background: "var(--color-organic)",
          }}
        />
      </div>
    </div>
  );
}
