"use client";

import { useEffect, useState } from "react";

import { EmptyState } from "@/components/ui/EmptyState";
import { GlassCard } from "@/components/ui/GlassCard";
import { CountUpNumber } from "@/components/ui/CountUpNumber";
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

type KpiPayload = { spend?: number };

const fmtMoney = (n: number) =>
  n >= 1000 ? `$${Math.round(n).toLocaleString()}` : `$${n.toFixed(2)}`;

const fmtCount = (n: number) => Math.round(n).toLocaleString();

/**
 * Paid vs Organic (WS7.E, redesigned post-review).
 *
 * Previous shape was a row of three KPI tiles + a share bar. The review
 * called it visually noisy and asked for a different read. New shape is
 * a single integrated card with two columns: BCAC headline on the
 * left (the section's "answer to the question"), and a paid-vs-organic
 * split visualization on the right (the supporting decomposition).
 * One card tells one story.
 *
 * BCAC (Blended Customer Acquisition Cost) = total paid spend / total
 * subs (paid + organic). This view is one of the few that opts into
 * the Organic bucket (via /api/bq/geo, which calls buildCohortSubquery
 * with includeOrganic: true).
 */
export function PaidVsOrganic() {
  const { from, to, client } = useGlobalFilters();
  const fromIso = from.toISOString().slice(0, 10);
  const toIso = to.toISOString().slice(0, 10);

  const [rows, setRows] = useState<GeoRow[]>([]);
  const [paidSpend, setPaidSpend] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const qs = `client=${encodeURIComponent(client)}&from=${fromIso}&to=${toIso}`;

    Promise.all([
      fetch(`/api/bq/geo?${qs}`).then((r) => r.json()),
      fetch(`/api/bq/dashboard-kpis?${qs}`).then((r) => r.json()),
    ])
      .then(([geo, kpis]: [GeoRow[], KpiPayload]) => {
        if (cancelled) return;
        setRows(Array.isArray(geo) ? geo : []);
        setPaidSpend(typeof kpis?.spend === "number" ? kpis.spend : null);
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
  if (rows.length === 0 && paidSpend == null) {
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

  // BCAC: paid spend over ALL subs (paid + organic). Falls back to
  // "—" when either the spend or sub side is unavailable.
  const bcac =
    paidSpend != null && totals.subD7 > 0 ? paidSpend / totals.subD7 : null;

  const total = totals.paid + totals.organic;
  const paidPct = total > 0 ? totals.paid / total : 0;
  const organicPct = total > 0 ? totals.organic / total : 0;

  return (
    <GlassCard
      className="flex flex-col gap-4 p-5"
      enterIndex={8}
    >
      <header className="flex items-baseline justify-between gap-2">
        <h3 className="font-display text-lg font-bold text-cloud-white">
          Paid vs Organic
        </h3>
        <p className="font-body text-xs text-[color:var(--text-muted)]">
          Cohort-attributed subs in the active window.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-[auto_1fr] md:gap-8">
        <BcacBlock bcac={bcac} />
        <SplitBlock
          paid={totals.paid}
          organic={totals.organic}
          paidPct={paidPct}
          organicPct={organicPct}
        />
      </div>
    </GlassCard>
  );
}

/**
 * Left column: the BCAC headline. Big tabular number in mint, label
 * above, definition below. No card frame because we're already inside
 * a GlassCard; doubling the surface would be busy.
 */
function BcacBlock({ bcac }: { bcac: number | null }) {
  return (
    <div className="flex flex-col gap-1.5 md:min-w-[180px]">
      <span className="font-body text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
        Blended CAC
      </span>
      <span
        className="font-display text-4xl font-extrabold leading-none tracking-tight tabular-nums"
        style={{
          color: "var(--color-ua)",
          textShadow: "0 0 18px color-mix(in oklab, var(--color-ua) 35%, transparent)",
        }}
      >
        {bcac == null ? (
          "—"
        ) : (
          <CountUpNumber value={bcac} decimals={2} prefix="$" duration={1100} />
        )}
      </span>
      <span className="font-body text-[11px] text-[color:var(--text-muted)]">
        Paid spend ÷ all subs
      </span>
    </div>
  );
}

/**
 * Right column: the paid / organic split. Single horizontal bar with
 * mint (paid) and a brand secondary (organic) tints. Per-side labels
 * stacked above (counts) and below (percent share).
 */
function SplitBlock({
  paid,
  organic,
  paidPct,
  organicPct,
}: {
  paid: number;
  organic: number;
  paidPct: number;
  organicPct: number;
}) {
  const total = paid + organic;
  if (total === 0) {
    return (
      <div className="flex items-center text-[color:var(--text-muted)] font-body text-sm">
        No subscriber activity to split for this window.
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <SplitLabel
          color="var(--color-ua)"
          label="Paid"
          count={paid}
          pct={paidPct}
        />
        <SplitLabel
          color="var(--color-organic)"
          label="Organic"
          count={organic}
          pct={organicPct}
          align="right"
        />
      </div>
      {/* Single-bar split. Two consecutive colored segments visually
          encode the relative weight. Sized at 8px to read as a
          confident divider, not a hairline. */}
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

function SplitLabel({
  color,
  label,
  count,
  pct,
  align = "left",
}: {
  color: string;
  label: string;
  count: number;
  pct: number;
  align?: "left" | "right";
}) {
  return (
    <div
      className={
        "flex flex-col gap-0.5 " +
        (align === "right" ? "items-end text-right" : "items-start text-left")
      }
    >
      <span className="inline-flex items-center gap-1.5 font-body text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
        <span
          aria-hidden
          className="inline-block h-2 w-2 rounded-full"
          style={{ background: color, boxShadow: `0 0 6px ${color}` }}
        />
        {label}
      </span>
      <span
        className="font-display text-2xl font-bold leading-none tabular-nums"
        style={{ color: "var(--text-primary)" }}
      >
        {fmtCount(count)}
      </span>
      <span
        className="font-body text-[11px] font-semibold tabular-nums"
        style={{ color }}
      >
        {(pct * 100).toFixed(0)}%
      </span>
    </div>
  );
}
