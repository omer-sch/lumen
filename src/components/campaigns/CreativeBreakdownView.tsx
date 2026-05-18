"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Megaphone } from "lucide-react";
import { GlassIcon } from "@/components/ui/GlassIcon";
import { LivePulse } from "@/components/ui/LivePulse";
import { CreativeBreakdownSkeleton } from "@/components/ui/Skeleton";
import { useGlobalFilters } from "@/lib/filters/use-global-filters";
import { findClient } from "@/lib/mock/clients";

/**
 * Per-ad drilldown view at /campaigns/creatives. Equivalent of the
 * GlobalComix Looker dashboard's Creative Breakdown page. Sits under
 * the Campaigns top-level page so the global filter (date / OS /
 * platform / client) flows in as context.
 *
 * WS4 ships the shell: header + breadcrumb + skeleton. WS5 wires in
 * the data hooks (`useCreativeBreakdown` / `useTopAdTrend`), the
 * filter chip row, the trend chart, the per-ad table, and the coverage
 * warning. Until then the page renders the skeleton so the route is
 * navigable and the layout shape is verifiable end-to-end.
 */
export function CreativeBreakdownView() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}

function Inner() {
  const { from, to, client } = useGlobalFilters();
  const c = findClient(client);
  const days = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
  const params = useSearchParams();
  const backQuery = params.toString();
  const backHref = backQuery ? `/campaigns?${backQuery}` : "/campaigns";

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

      <CreativeBreakdownSkeleton />
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
