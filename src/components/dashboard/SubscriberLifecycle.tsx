"use client";

import { useEffect, useState } from "react";

import { GlassCard } from "@/components/ui/GlassCard";
import { SubscriberLifecycleSkeleton } from "@/components/ui/Skeleton";
import { useGlobalFilters } from "@/lib/filters/use-global-filters";

type DailyRow = {
  date: string;
  os: string;
  subs: number;
  churn: number;
  netSub: number;
};

type OsMixRow = { os: string; subs: number; share: number };
type NetSubPoint = { date: string; netSub: number };

const OS_TINT: Record<string, string> = {
  iOS: "var(--color-ua)",
  Android: "var(--color-yellow)",
  Web: "var(--color-organic)",
};

/**
 * Subscriber Lifecycle (WS7.D). Renders three pieces sourced from
 * `dwh_total_subs_globalcomix`:
 *   - KPI strip: Total Subs / Churn / Net Sub for the active period.
 *   - OS donut: iOS / Android / Web mix.
 *   - Net Sub Over Time: simple bar list.
 *
 * Note: this section intentionally IGNORES the dashboard's global OS
 * filter — the rest of the dashboard might be iOS-only, but the
 * lifecycle frame is its own scope (Web users matter for lifecycle
 * regardless of paid OS narrowing).
 */
export function SubscriberLifecycle() {
  const { from, to, client } = useGlobalFilters();
  const fromIso = from.toISOString().slice(0, 10);
  const toIso = to.toISOString().slice(0, 10);

  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [osMix, setOsMix] = useState<OsMixRow[]>([]);
  const [trend, setTrend] = useState<NetSubPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const base = `client=${encodeURIComponent(client)}&from=${fromIso}&to=${toIso}`;
    Promise.all([
      fetch(`/api/bq/total-subs?${base}`).then((r) => r.json()),
      fetch(`/api/bq/total-subs?${base}&view=os-mix`).then((r) => r.json()),
      fetch(`/api/bq/total-subs?${base}&view=net-sub-trend`).then((r) => r.json()),
    ])
      .then(([d, m, t]) => {
        if (cancelled) return;
        setDaily(Array.isArray(d) ? d : []);
        setOsMix(Array.isArray(m) ? m : []);
        setTrend(Array.isArray(t) ? t : []);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [client, fromIso, toIso]);

  // Totals: sum across the daily rows. Net Sub = subs - churn for the
  // window regardless of OS.
  const totals = daily.reduce(
    (acc, r) => {
      acc.subs += r.subs;
      acc.churn += r.churn;
      acc.netSub += r.netSub;
      return acc;
    },
    { subs: 0, churn: 0, netSub: 0 },
  );

  // Cold-load: show a section-shaped skeleton so the dashboard layout
  // doesn't jump as the three fetches resolve. Empty-state branch is
  // handled in WS5 with an EmptyState card; here we still return null
  // (the loaded layout below) to keep WS2 self-contained.
  if (loading) return <SubscriberLifecycleSkeleton />;
  if (daily.length === 0 && osMix.length === 0) return null;

  return (
    <GlassCard className="flex flex-col gap-4 p-4">
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="font-display text-lg font-bold text-cloud-white">
          Subscriber lifecycle
        </h3>
        <p className="font-body text-xs text-[color:var(--text-muted)]">
          Lifecycle is all OS regardless of the dashboard filter.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <KpiTile label="New subscribers" value={totals.subs} />
        <KpiTile label="Cancellations" value={totals.churn} />
        <KpiTile label="Net Sub" value={totals.netSub} highlight />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <OsMix rows={osMix} />
        <NetSubBars rows={trend.slice(-30)} />
      </div>
    </GlassCard>
  );
}

function KpiTile({
  label,
  value,
  highlight,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div
      className="flex flex-col gap-1 rounded-md p-3"
      style={{
        background: highlight
          ? "color-mix(in oklab, var(--color-ua) 8%, var(--surface-input))"
          : "var(--surface-input)",
        border: highlight
          ? "1px solid color-mix(in oklab, var(--color-ua) 25%, transparent)"
          : "1px solid var(--border-subtle)",
      }}
    >
      <span className="font-body text-xs uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
        {label}
      </span>
      <span className="font-display text-2xl font-bold tabular-nums text-cloud-white">
        {value.toLocaleString()}
      </span>
    </div>
  );
}

function OsMix({ rows }: { rows: OsMixRow[] }) {
  const total = rows.reduce((acc, r) => acc + r.subs, 0);
  if (total === 0) {
    return (
      <p className="font-body text-sm text-[color:var(--text-muted)]">
        No OS mix for this window.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <span className="font-body text-xs uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
        OS mix
      </span>
      <ul className="flex flex-col gap-1.5">
        {rows.map((r) => {
          const pct = (r.share * 100).toFixed(1);
          return (
            <li key={r.os} className="flex items-center gap-3 font-body text-sm">
              <span
                aria-hidden
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: OS_TINT[r.os] ?? "var(--text-muted)" }}
              />
              <span className="min-w-[64px] text-[color:var(--text-light-primary)]">
                {r.os}
              </span>
              <div
                className="h-2 flex-1 overflow-hidden rounded-full"
                style={{ background: "var(--surface-input)" }}
              >
                <div
                  className="h-full"
                  style={{
                    width: `${r.share * 100}%`,
                    background: OS_TINT[r.os] ?? "var(--text-muted)",
                  }}
                />
              </div>
              <span className="w-12 text-right tabular-nums text-[color:var(--text-light-secondary)]">
                {pct}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function NetSubBars({ rows }: { rows: NetSubPoint[] }) {
  if (rows.length === 0) {
    return (
      <p className="font-body text-sm text-[color:var(--text-muted)]">
        No net-sub data for this window.
      </p>
    );
  }
  const max = Math.max(...rows.map((r) => Math.abs(r.netSub)), 1);
  return (
    <div className="flex flex-col gap-2">
      <span className="font-body text-xs uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
        Net Sub (last 30 days)
      </span>
      <div className="flex h-24 items-end gap-0.5">
        {rows.map((r) => {
          const h = (Math.abs(r.netSub) / max) * 100;
          const positive = r.netSub >= 0;
          return (
            <div
              key={r.date}
              title={`${r.date}: ${r.netSub.toLocaleString()}`}
              className="w-full rounded-t-sm"
              style={{
                height: `${Math.max(h, 4)}%`,
                background: positive
                  ? "var(--color-ua)"
                  : "var(--color-creative)",
                opacity: 0.85,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
