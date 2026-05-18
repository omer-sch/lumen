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

type KpiPayload = { spend?: number };

const fmtMoney = (n: number) =>
  n >= 1000 ? `$${Math.round(n).toLocaleString()}` : `$${n.toFixed(2)}`;

const fmtCount = (n: number) => Math.round(n).toLocaleString();

/**
 * Paid vs Organic + BCAC strip (WS7.E). Compact card that sits above
 * the trend chart so the BCAC headline is visible without scrolling.
 *
 * BCAC (Blended Customer Acquisition Cost) = total paid spend / total
 * subs (paid + organic). The view is one of the few that intentionally
 * opts into the Organic bucket (via /api/bq/geo, which uses
 * buildCohortSubquery with includeOrganic: true).
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

  const paidShare = totals.subD7 > 0 ? totals.paid / totals.subD7 : 0;
  const organicShare = 1 - paidShare;

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

      {/* BCAC + Sub Total ride the shared KpiCard so they pick up
          count-up animation, stagger entry, and the brand chip shape.
          BCAC is the section headline so it takes the mint highlight
          and the lower-better polarity. Sub Paid / Organic stays as a
          local PairTile because KpiCard's value is a single string -
          two numbers next to each other don't fit cleanly. PairTile
          mirrors the KpiCard box shape so the row reads consistent. */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <KpiCard
          id="paid-vs-organic-bcac"
          label="BCAC"
          value={bcac == null ? "—" : fmtMoney(bcac)}
          delta={null}
          direction="lower-better"
          size="compact"
          enterIndex={1}
          highlight
          hint="Paid spend ÷ all subs"
        />
        <KpiCard
          id="paid-vs-organic-sub-total"
          label="Sub Total"
          value={fmtCount(totals.subD7)}
          delta={null}
          direction="higher-better"
          size="compact"
          enterIndex={2}
        />
        <PairTile
          label="Sub Paid / Organic"
          paid={fmtCount(totals.paid)}
          organic={fmtCount(totals.organic)}
        />
      </div>

      <ShareBar paidShare={paidShare} organicShare={organicShare} />
    </GlassCard>
  );
}

/**
 * PairTile renders two numbers side-by-side under a single label. We
 * don't try to fit this into KpiCard because KpiCard's value is a
 * single pre-formatted string + a CountUpNumber animation; "284 / 1310"
 * doesn't decompose cleanly into either of those.
 *
 * Visual shape (border, radius, padding, label tracking) mirrors the
 * compact KpiCard's outer box so the three-tile row reads consistently.
 */
function PairTile({
  label,
  paid,
  organic,
}: {
  label: string;
  paid: string;
  organic: string;
}) {
  return (
    <div
      className="flex h-full flex-col gap-4 rounded-lg p-5"
      style={{
        background: "var(--surface-glass)",
        border: "1px solid var(--border-glass)",
        WebkitBackdropFilter: "var(--blur-glass)",
        backdropFilter: "var(--blur-glass)",
        boxShadow: "var(--shadow-glass)",
      }}
    >
      <span className="font-body text-xs font-semibold uppercase tracking-wider text-[color:var(--text-muted)]">
        {label}
      </span>
      <div className="flex flex-wrap items-baseline gap-2">
        <span
          className="font-display font-extrabold leading-none tracking-tight tabular-nums text-[color:var(--text-primary)]"
          style={{ fontSize: "var(--text-3xl)" }}
        >
          {paid}
        </span>
        <span className="font-body text-sm text-[color:var(--text-muted)]">/</span>
        <span
          className="font-display font-extrabold leading-none tracking-tight tabular-nums"
          style={{
            fontSize: "var(--text-3xl)",
            color: "var(--color-organic)",
          }}
        >
          {organic}
        </span>
      </div>
      <p className="font-body text-xs text-[color:var(--text-muted)]">
        Paid · Organic
      </p>
    </div>
  );
}

function ShareBar({
  paidShare,
  organicShare,
}: {
  paidShare: number;
  organicShare: number;
}) {
  if (paidShare === 0 && organicShare === 0) return null;
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full">
      <div
        className="h-full"
        style={{
          width: `${paidShare * 100}%`,
          background: "var(--color-ua)",
        }}
        aria-label={`Paid ${(paidShare * 100).toFixed(0)}%`}
      />
      <div
        className="h-full"
        style={{
          width: `${organicShare * 100}%`,
          background: "var(--color-organic)",
        }}
        aria-label={`Organic ${(organicShare * 100).toFixed(0)}%`}
      />
    </div>
  );
}
