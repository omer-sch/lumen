"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Megaphone } from "lucide-react";
import { GlassIcon } from "@/components/ui/GlassIcon";
import { InfoCallout } from "@/components/ui/InfoCallout";
import { LivePulse } from "@/components/ui/LivePulse";
import { SectionError } from "@/components/ui/SectionError";
import { CreativeBreakdownSkeleton } from "@/components/ui/Skeleton";
import { useGlobalFilters } from "@/lib/filters/use-global-filters";
import { useCreativeBreakdown } from "@/lib/campaigns/use-creative-breakdown";
import { useTopAdTrend } from "@/lib/campaigns/use-top-ad-trend";
import { findClient } from "@/lib/mock/clients";
import { CampaignsAreaTabs } from "./CampaignsAreaTabs";
import {
  CreativeFilterChips,
  type LocalFilters,
} from "./creatives/CreativeFilterChips";
import { TopAdTrend } from "./creatives/TopAdTrend";
import { CreativeTable } from "./creatives/CreativeTable";

/**
 * Per-ad drilldown view at /campaigns/creatives. Equivalent of the
 * GlobalComix Looker dashboard's Creative Breakdown page. Sits under
 * the Campaigns top-level page so the global filter (date / OS /
 * platform / client) flows in as context.
 *
 * Layout, top to bottom:
 *   - Header (client+window chip, title, subtitle, back-link to /campaigns).
 *   - Filter chip row (6 local-state chips: campaign, campaign status,
 *     adset, ad name, ad status, country).
 *   - Top Ad trend chart (current vs prior 30 days).
 *   - Per-ad table (12 columns, ranked by spend DESC).
 *   - Coverage warning (when Google / Apple rows appear without
 *     per-ad spend in BQ).
 */
export function CreativeBreakdownView() {
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

  const { rows, loading, error, refetch } = useCreativeBreakdown({
    from,
    to,
    client,
    os,
    platforms,
  });
  const { data: trend, loading: trendLoading } = useTopAdTrend({
    from,
    to,
    client,
    os,
    platforms,
  });

  // Local filter chip state — narrows the visible rows post-fetch.
  // Owned by the view so a refresh of the underlying data doesn't
  // wipe a chip selection.
  const [local, setLocal] = useState<LocalFilters>({
    campaignNames: [],
    campaignStatuses: [],
    adsetNames: [],
    adNameSearch: "",
    adStatuses: [],
    countries: [],
  });

  const visibleRows = useMemo(() => {
    if (!rows) return null;
    const search = local.adNameSearch.trim().toLowerCase();
    return rows.filter((r) => {
      if (
        local.campaignNames.length > 0 &&
        !local.campaignNames.includes(r.campaign_name ?? "")
      ) {
        return false;
      }
      if (
        local.adsetNames.length > 0 &&
        !local.adsetNames.includes(r.adset_name)
      ) {
        return false;
      }
      if (
        search.length > 0 &&
        !r.ad_name.toLowerCase().includes(search) &&
        !r.creative_name.toLowerCase().includes(search)
      ) {
        return false;
      }
      return true;
    });
  }, [rows, local]);

  const hasGoogleOrAppleRow = useMemo(
    () =>
      (rows ?? []).some(
        (r) => r.network === "Google" || r.network === "Apple Search Ads",
      ),
    [rows],
  );

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
            Creative Breakdown
          </h2>
          <p className="max-w-2xl font-body text-sm text-[color:var(--text-secondary)]">
            Per-ad performance across the active window. Ranked by spend.
            Meta thumbnails when available; Google and Apple per-ad spend
            are not in BigQuery today, so their rows show subscriber
            counts only.
          </p>
        </div>

        <div
          className="flex items-center gap-3 rounded-lg p-3"
          style={{
            background: "var(--surface-glass)",
            border: "1px solid var(--border-glass)",
          }}
        >
          <GlassIcon icon={Megaphone} accentVar="--color-ua" size="sm" />
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

      <CampaignsAreaTabs activeTab="creatives" />

      <div
        role="tabpanel"
        id="campaigns-area-panel-creatives"
        aria-labelledby="campaigns-area-tab-creatives"
        className="flex flex-col gap-6 md:gap-7"
      >
        {rows === null && loading ? (
          <CreativeBreakdownSkeleton />
        ) : error && rows === null ? (
          <SectionError
            section="the creative breakdown"
            shape="min-h-[14rem]"
            onRetry={refetch}
            data-testid="creative-breakdown-error"
          />
        ) : (
          <>
            <CreativeFilterChips
              rows={rows ?? []}
              value={local}
              onChange={setLocal}
            />
            <TopAdTrend data={trend} loading={trendLoading} />
            <CreativeTable rows={visibleRows ?? []} />
            {hasGoogleOrAppleRow && (
              <InfoCallout
                data-testid="creative-coverage-warning"
                title="Some networks don't expose per-ad spend"
                body="Google Ads and Apple Search Ads don't expose per-ad spend in BigQuery. Their rows show subscriber counts only; CPA and ROI columns render as “—”."
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function BackLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      data-testid="creative-breakdown-back-link"
      className="inline-flex items-center gap-1.5 self-start font-body text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--text-muted)] transition-[color,transform] duration-280 ease-out-quart hover:-translate-x-0.5 hover:text-cloud-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ua focus-visible:ring-offset-2 focus-visible:ring-offset-navy"
    >
      <ArrowLeft className="h-3 w-3" strokeWidth={2.5} />
      Back to campaigns
    </Link>
  );
}
