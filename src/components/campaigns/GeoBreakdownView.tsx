"use client";

import { Suspense, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Globe } from "lucide-react";
import { GlassIcon } from "@/components/ui/GlassIcon";
import { InfoCallout } from "@/components/ui/InfoCallout";
import { LivePulse } from "@/components/ui/LivePulse";
import { SectionError } from "@/components/ui/SectionError";
import { GeoBreakdownSkeleton } from "@/components/ui/Skeleton";
import { useGlobalFilters } from "@/lib/filters/use-global-filters";
import { useGeoData } from "@/lib/campaigns/use-geo-data";
import { findClient } from "@/lib/mock/clients";
import { ChoroplethMap, computeBuckets } from "./geo/ChoroplethMap";
import { TopCountriesDonut } from "./geo/TopCountriesDonut";
import { GeoCountryTable } from "./geo/GeoCountryTable";
import { GeoColorScale } from "./geo/GeoColorScale";

/**
 * Client-wide Geo drilldown at /campaigns/geo. Sibling to the
 * /campaigns/creatives view. Loads cohort-side per-country metrics
 * from `queryGlobalComixGeo` and surfaces a donut + choropleth + a
 * sortable detail table.
 *
 * Layout, top to bottom:
 *   - Header (UA chip, title, subtitle, back link to /campaigns).
 *   - Phase-2 InfoCallout (cost-side metrics aren't in BQ yet).
 *   - Row 1 (1/3 + 2/3 on lg): TopCountriesDonut + ChoroplethMap.
 *   - GeoColorScale legend.
 *   - GeoCountryTable.
 */
export function GeoBreakdownView() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}

function Inner() {
  const { from, to, client, os, platforms } = useGlobalFilters();
  const c = findClient(client);
  const days = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
  const params = useSearchParams();
  const backQuery = params.toString();
  const backHref = backQuery ? `/campaigns?${backQuery}` : "/campaigns";

  const { rows, loading, error, refetch } = useGeoData({
    from,
    to,
    client,
    os,
    platforms,
  });

  const buckets = useMemo(() => computeBuckets(rows ?? []), [rows]);

  return (
    <div className="flex flex-col gap-6 py-2 md:gap-7">
      <BackLink href={backHref} />
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <span
            className="inline-flex items-center gap-2 self-start rounded-full px-3 py-1 font-body text-xs font-semibold uppercase tracking-wider"
            style={{
              background: "color-mix(in oklab, var(--color-ua) 12%, transparent)",
              color: "var(--color-ua)",
              border:
                "1px solid color-mix(in oklab, var(--color-ua) 35%, transparent)",
              boxShadow:
                "0 0 24px color-mix(in oklab, var(--color-ua) 18%, transparent)",
            }}
          >
            <LivePulse accent="mint" size={8} />
            UA · {c.name} · last {days} days
          </span>
          <h2 className="font-display text-2xl font-extrabold leading-tight tracking-tight text-cloud-white sm:text-3xl">
            Geo Breakdown
          </h2>
          <p className="max-w-2xl font-body text-sm text-[color:var(--text-secondary)]">
            Where subscribers come from across the active window. Country
            fill on the map is keyed on Sub D7 (quartile buckets). The
            donut highlights the top five drivers; the table sorts by
            any column for deeper scans.
          </p>
        </div>

        <div
          className="flex items-center gap-3 rounded-lg p-3"
          style={{
            background: "var(--surface-glass)",
            border: "1px solid var(--border-glass)",
          }}
        >
          <GlassIcon icon={Globe} accentVar="--color-ua" size="sm" />
          <div className="min-w-0">
            <p className="font-body text-xs uppercase tracking-wider text-[color:var(--text-muted)]">
              Window
            </p>
            <p className="mt-0.5 font-body text-sm font-semibold text-cloud-white">
              {from.toISOString().slice(0, 10)} → {to.toISOString().slice(0, 10)}
            </p>
          </div>
        </div>
      </header>

      {rows === null && loading ? (
        <GeoBreakdownSkeleton />
      ) : error && rows === null ? (
        <SectionError
          section="the geo breakdown"
          shape="min-h-[14rem]"
          onRetry={refetch}
          data-testid="geo-breakdown-error"
        />
      ) : (
        <>
          <InfoCallout
            data-testid="geo-coverage-warning"
            title="Cost-side metrics by country are a Phase-2 join"
            body="The per-country spend join across the per-network spend tables hasn't shipped yet, so CPI, CPA D7, and ROI by country aren't shown. This view reports subscriber-side metrics (paid vs organic, Sub D7, Rev D7), which BigQuery already covers for GlobalComix."
          />

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="lg:col-span-1">
              <TopCountriesDonut rows={rows ?? []} enterIndex={1} />
            </div>
            <div className="lg:col-span-2">
              <ChoroplethMap rows={rows ?? []} enterIndex={2} />
            </div>
          </div>

          <GeoColorScale buckets={buckets} />

          <GeoCountryTable rows={rows ?? []} />
        </>
      )}
    </div>
  );
}

function BackLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      data-testid="geo-breakdown-back-link"
      className="inline-flex items-center gap-1.5 self-start font-body text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--text-muted)] transition-[color,transform] duration-280 ease-out-quart hover:-translate-x-0.5 hover:text-cloud-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ua focus-visible:ring-offset-2 focus-visible:ring-offset-navy"
    >
      <ArrowLeft className="h-3 w-3" strokeWidth={2.5} />
      Back to campaigns
    </Link>
  );
}
