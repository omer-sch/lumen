"use client";

import { useEffect, useState } from "react";

import { KpiCard } from "@/components/dashboard/KpiCard";
import { KpiCardSkeleton } from "@/components/ui/Skeleton";
import { useGlobalFilters } from "@/lib/filters/use-global-filters";

type GeoRow = {
  sub_d7?: number;
  sub_paid?: number;
  sub_organic?: number;
};

type KpiPayload = { spend?: number };

const fmtMoney = (n: number) =>
  n >= 1000 ? `$${Math.round(n).toLocaleString()}` : `$${n.toFixed(2)}`;

/**
 * BCAC (Blended Customer Acquisition Cost) hero tile for the
 * Attribution tab. Promoted out of PaidVsOrganic in WS3.D so the tab's
 * headline metric leads the layout instead of being buried in a tile
 * grid.
 *
 * BCAC = total paid spend / total subs (paid + organic). Reuses the
 * same two fetches PaidVsOrganic uses (geo for the sub counts,
 * dashboard-kpis for the spend) so this doesn't add a third BQ trip.
 *
 * Direction is "lower-better" (acquisition cost going down is good).
 * Highlight ON so it picks up the mint hero treatment from KpiCard
 * instead of competing with PaidVsOrganic for visual weight.
 */
export function BcacHeadline() {
  const { from, to, client, os, platforms } = useGlobalFilters();
  const fromIso = from.toISOString().slice(0, 10);
  const toIso = to.toISOString().slice(0, 10);

  const [bcac, setBcac] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const params = new URLSearchParams({
      client,
      from: fromIso,
      to: toIso,
    });
    if (os !== "total") params.set("os", os);
    if (platforms.length > 0) params.set("platforms", platforms.join(","));
    const qs = params.toString();

    Promise.all([
      fetch(`/api/bq/geo?${qs}`).then((r) => r.json()),
      fetch(`/api/bq/dashboard-kpis?${qs}`).then((r) => r.json()),
    ])
      .then(([geo, kpis]: [GeoRow[], KpiPayload]) => {
        if (cancelled) return;
        const subTotal = Array.isArray(geo)
          ? geo.reduce((acc, r) => acc + (r.sub_d7 ?? 0), 0)
          : 0;
        const spend = typeof kpis?.spend === "number" ? kpis.spend : 0;
        // BCAC is honest only when both sides are positive; otherwise
        // KpiCard renders a muted "—" with a "No prior-period baseline"
        // tooltip (the same pattern lifecycle tiles use).
        setBcac(spend > 0 && subTotal > 0 ? spend / subTotal : null);
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [client, fromIso, toIso, os, platforms]);

  if (loading) return <KpiCardSkeleton />;

  return (
    <KpiCard
      id="attribution-bcac"
      label="Blended CAC"
      value={bcac == null ? "—" : fmtMoney(bcac)}
      delta={null}
      direction="lower-better"
      size="hero"
      enterIndex={0}
      highlight
      hint="Paid spend ÷ all subs (paid + organic) in the active window"
    />
  );
}
