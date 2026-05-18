"use client";

import { useEffect, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

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

type GeoTotals = { subD7: number; paid: number; organic: number };

const fmtCount = (n: number) => Math.round(n).toLocaleString();

/**
 * Shared fetch for the geo-cohort endpoint that powers both the
 * Paid vs Organic KPI card and the Mix donut card. Each instance
 * triggers its own request; the /api/bq/geo route is warmed by the
 * dashboard prefetch so duplicate calls hit the cache cheaply.
 */
function useGeoTotals(): { loading: boolean; totals: GeoTotals | null } {
  const { from, to, client } = useGlobalFilters();
  const fromIso = from.toISOString().slice(0, 10);
  const toIso = to.toISOString().slice(0, 10);

  const [rows, setRows] = useState<GeoRow[] | null>(null);
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

  if (rows === null) return { loading, totals: null };
  const totals = rows.reduce<GeoTotals>(
    (acc, r) => {
      acc.subD7 += r.sub_d7 ?? 0;
      acc.paid += r.sub_paid ?? 0;
      acc.organic += r.sub_organic ?? 0;
      return acc;
    },
    { subD7: 0, paid: 0, organic: 0 },
  );
  return { loading, totals };
}

/**
 * Paid vs Organic — KPI card.
 *
 * Three compact KpiCards (Sub Total / Sub Paid / Sub Organic) for the
 * cohort window. The donut visualization lives in a separate card
 * (`PaidVsOrganicMix`) so each visual gets its own breathing room and
 * the share-of-total reads as a standalone moment instead of being
 * crowded under the KPI strip.
 */
export function PaidVsOrganic() {
  const { loading, totals } = useGeoTotals();

  if (loading) return <PaidVsOrganicSkeleton />;
  if (!totals || (totals.paid === 0 && totals.organic === 0)) {
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
    </GlassCard>
  );
}

/**
 * Paid vs Organic — Mix donut card.
 *
 * Standalone GlassCard so the donut isn't crammed under the KPI strip.
 * Mint = paid (var(--color-ua)), violet = organic (var(--color-organic))
 * per the brand skill. Center hole carries the cohort total.
 */
export function PaidVsOrganicMix() {
  const { loading, totals } = useGeoTotals();
  if (loading || !totals) return null;
  if (totals.paid === 0 && totals.organic === 0) return null;

  const total = totals.paid + totals.organic;
  const paidPct = total > 0 ? totals.paid / total : 0;
  const organicPct = total > 0 ? totals.organic / total : 0;

  const data = [
    {
      name: "Paid",
      value: totals.paid,
      pct: paidPct,
      fill: "var(--color-ua)",
    },
    {
      name: "Organic",
      value: totals.organic,
      pct: organicPct,
      fill: "var(--color-organic)",
    },
  ];

  return (
    <GlassCard className="flex items-center justify-center p-4" enterIndex={4}>
      <div
        className="flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:justify-center"
        role="img"
        aria-label={`Paid ${(paidPct * 100).toFixed(0)}%, Organic ${(organicPct * 100).toFixed(0)}%`}
      >
        <div className="relative h-32 w-32 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Tooltip
                cursor={{ fill: "var(--color-ua)", fillOpacity: 0.06 }}
                contentStyle={{
                  background: "rgba(10, 20, 40, 0.96)",
                  backdropFilter: "blur(12px)",
                  border: "1px solid var(--border-strong, rgba(255,255,255,0.18))",
                  borderRadius: 10,
                  color: "#FFFFFF",
                  fontSize: 13,
                  fontWeight: 600,
                  padding: "8px 12px",
                  boxShadow: "var(--shadow-elevated)",
                }}
                itemStyle={{
                  color: "#FFFFFF",
                  fontSize: 13,
                  fontWeight: 600,
                  padding: 0,
                }}
                labelStyle={{
                  color: "#FFFFFF",
                  fontSize: 12,
                  fontWeight: 700,
                  marginBottom: 4,
                }}
                formatter={(value, _name, item) => {
                  const n = typeof value === "number" ? value : Number(value);
                  const safe = Number.isFinite(n) ? n : 0;
                  const payload = (item as { payload?: { pct?: number } })
                    ?.payload;
                  const pct = payload?.pct ?? 0;
                  return [
                    `${safe.toLocaleString()} (${(pct * 100).toFixed(1)}%)`,
                    String(_name),
                  ];
                }}
              />
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius="62%"
                outerRadius="92%"
                paddingAngle={2}
                stroke="var(--surface-base)"
                strokeWidth={2}
                isAnimationActive={false}
              >
                {data.map((d) => (
                  <Cell key={d.name} fill={d.fill} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-body text-[9px] uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
              Total
            </span>
            <span className="font-display text-base font-bold text-cloud-white tabular-nums">
              {total.toLocaleString()}
            </span>
          </div>
        </div>
        <ul className="flex flex-col gap-2 font-body text-sm">
          <li className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{
                background: "var(--color-ua)",
                boxShadow: "0 0 6px var(--color-ua)",
              }}
            />
            <span className="min-w-[58px] text-[color:var(--text-secondary)]">
              Paid
            </span>
            <span className="tabular-nums text-cloud-white">
              {(paidPct * 100).toFixed(1)}%
            </span>
          </li>
          <li className="flex items-center gap-2.5">
            <span
              aria-hidden
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{
                background: "var(--color-organic)",
                boxShadow: "0 0 6px var(--color-organic)",
              }}
            />
            <span className="min-w-[58px] text-[color:var(--text-secondary)]">
              Organic
            </span>
            <span className="tabular-nums text-cloud-white">
              {(organicPct * 100).toFixed(1)}%
            </span>
          </li>
        </ul>
      </div>
    </GlassCard>
  );
}
