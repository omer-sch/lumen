"use client";

import { useEffect, useState } from "react";

import { GlassCard } from "@/components/ui/GlassCard";
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

  useEffect(() => {
    let cancelled = false;
    const qs = `client=${encodeURIComponent(client)}&from=${fromIso}&to=${toIso}`;

    Promise.all([
      fetch(`/api/bq/geo?${qs}`).then((r) => r.json()),
      fetch(`/api/bq/dashboard-kpis?${qs}`).then((r) => r.json()),
    ])
      .then(([geo, kpis]: [GeoRow[], KpiPayload]) => {
        if (cancelled) return;
        setRows(Array.isArray(geo) ? geo : []);
        setPaidSpend(typeof kpis?.spend === "number" ? kpis.spend : null);
      })
      .catch(() => {
        // Soft-fail: empty card disappears below.
      });

    return () => {
      cancelled = true;
    };
  }, [client, fromIso, toIso]);

  if (rows.length === 0 && paidSpend == null) return null;

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

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <BcacTile bcac={bcac} />
        <Tile label="Sub Total" value={fmtCount(totals.subD7)} />
        <Tile label="Sub Paid / Organic" value={`${fmtCount(totals.paid)} / ${fmtCount(totals.organic)}`} />
      </div>

      <ShareBar paidShare={paidShare} organicShare={organicShare} />
    </GlassCard>
  );
}

function BcacTile({ bcac }: { bcac: number | null }) {
  return (
    <div
      className="flex flex-col gap-1 rounded-md p-3"
      style={{
        background: "color-mix(in oklab, var(--color-ua) 8%, var(--surface-input))",
        border: "1px solid color-mix(in oklab, var(--color-ua) 25%, transparent)",
      }}
    >
      <span className="font-body text-xs uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
        BCAC
      </span>
      <span className="font-display text-2xl font-bold tabular-nums text-cloud-white">
        {bcac == null ? "—" : fmtMoney(bcac)}
      </span>
      <span className="font-body text-[11px] text-[color:var(--text-muted)]">
        Paid spend ÷ all subs
      </span>
    </div>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="flex flex-col gap-1 rounded-md p-3"
      style={{
        background: "var(--surface-input)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <span className="font-body text-xs uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
        {label}
      </span>
      <span className="font-display text-2xl font-bold tabular-nums text-cloud-white">
        {value}
      </span>
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
