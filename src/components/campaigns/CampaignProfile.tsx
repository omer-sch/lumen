"use client";

import { Suspense, useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { LivePulse } from "@/components/ui/LivePulse";
import { SectionError } from "@/components/ui/SectionError";
import { TrendChartSkeleton, KpiCardSkeleton } from "@/components/ui/Skeleton";
import { KpiCard } from "@/components/dashboard/KpiCard";
import { TrendChart } from "@/components/dashboard/TrendChart";
import { AdsetBreakdown } from "@/components/campaigns/profile/AdsetBreakdown";
import { CreativeBreakdown } from "@/components/campaigns/profile/CreativeBreakdown";
import { GeoBreakdown } from "@/components/campaigns/profile/GeoBreakdown";
import { PeerComparison } from "@/components/campaigns/profile/PeerComparison";
import { CoverageWarning } from "@/components/campaigns/profile/CoverageWarning";
import { useGlobalFilters } from "@/lib/filters/use-global-filters";
import { useCampaignProfile } from "@/lib/campaigns/use-campaign-profile";
import { findClient } from "@/lib/mock/clients";
import type {
  CampaignSummary,
  CampaignTrendPoint,
  TrendPoint,
} from "@/types/dashboard";

/**
 * Profile page for one campaign. Renders the header + KPI strip + a
 * daily trend chart. WS5 fills in the adset / creative / geo / peer
 * breakdown sections below.
 */
export function CampaignProfile({ campaignId }: { campaignId: string }) {
  return (
    <Suspense fallback={null}>
      <Inner campaignId={campaignId} />
    </Suspense>
  );
}

function Inner({ campaignId }: { campaignId: string }) {
  const { from, to, client } = useGlobalFilters();
  const c = findClient(client);
  const days = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
  const { data, loading, error, refetch } = useCampaignProfile({
    campaignId,
    from,
    to,
    client,
  });

  const params = useSearchParams();
  const backQuery = params.toString();
  const backHref = backQuery ? `/campaigns?${backQuery}` : "/campaigns";

  if (loading && data === null) {
    return (
      <div className="flex flex-col gap-6 py-2 md:gap-7" data-testid="profile-loading">
        <BackLink href={backHref} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <KpiCardSkeleton key={i} />
          ))}
        </div>
        <TrendChartSkeleton />
      </div>
    );
  }

  if (error && data === null) {
    return (
      <div className="flex flex-col gap-6 py-2 md:gap-7">
        <BackLink href={backHref} />
        <SectionError
          section="this campaign's profile"
          shape="min-h-[14rem]"
          onRetry={refetch}
          data-testid="profile-error"
        />
      </div>
    );
  }

  const summary = data?.summary ?? null;
  if (!summary) {
    return (
      <div className="flex flex-col gap-4 py-6" data-testid="profile-empty">
        <BackLink href={backHref} />
        <GlassCard className="flex flex-col gap-2 p-6">
          <h2 className="font-display text-xl font-bold text-cloud-white">
            Campaign not found in this window
          </h2>
          <p className="font-body text-sm text-[color:var(--text-secondary)]">
            No spend rows for <code className="text-cloud-white">{campaignId}</code>{" "}
            between {fromTo(from, to)}. Try widening the date range, or use the
            back link to return to the index.
          </p>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 py-2 md:gap-7">
      <BackLink href={backHref} />

      <CoverageWarning summary={summary} from={from} />

      <ProfileHeader summary={summary} clientName={c.name} days={days} />

      <KpiStrip summary={summary} />

      <ProfileTrendChart trend={data?.trend ?? []} />

      <AdsetBreakdown adsets={data?.adsets ?? []} />

      <CreativeBreakdown creatives={data?.creatives ?? []} />

      <GeoBreakdown geo={data?.geo ?? []} />

      <PeerComparison
        campaignId={summary.campaign_id}
        family={summary.family}
        geo={summary.geo}
      />
    </div>
  );
}

function BackLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 self-start font-body text-[10px] font-semibold uppercase tracking-[0.18em] text-[color:var(--text-muted)] transition-[color,transform] duration-280 ease-out-quart hover:-translate-x-0.5 hover:text-cloud-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ua focus-visible:ring-offset-2 focus-visible:ring-offset-navy"
    >
      <ArrowLeft className="h-3 w-3" strokeWidth={2.5} />
      Back to campaigns
    </Link>
  );
}

function fromTo(from: Date, to: Date): string {
  return `${from.toISOString().slice(0, 10)} and ${to.toISOString().slice(0, 10)}`;
}

function ProfileHeader({
  summary,
  clientName,
  days,
}: {
  summary: CampaignSummary;
  clientName: string;
  days: number;
}) {
  const chips: { label: string; value: string }[] = [
    { label: "Network", value: summary.network || "—" },
    { label: "Platform", value: summary.platform || "—" },
    { label: "Family", value: summary.family || "—" },
    { label: "Geo", value: summary.geo || "—" },
  ].filter((c) => c.value !== "—");

  return (
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((chip) => (
            <span
              key={chip.label}
              className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em]"
              style={{
                background: "var(--surface-hover)",
                color: "var(--text-secondary)",
              }}
            >
              {chip.label}: {chip.value}
            </span>
          ))}
          <StatusPill state={summary.campaign_status} />
          <span className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
            {clientName} · last {days} days
          </span>
        </div>
        <h2 className="font-display text-2xl font-extrabold leading-tight tracking-tight text-cloud-white sm:text-3xl">
          {summary.campaign_name || summary.campaign_id}
        </h2>
        {summary.campaign_name && (
          <p className="font-body text-xs text-[color:var(--text-muted)]">
            {summary.campaign_id}
          </p>
        )}
      </div>
    </header>
  );
}

function StatusPill({ state }: { state: string | null }) {
  if (!state) return null;
  const s = state.trim().toLowerCase();
  const isRunning = s === "running" || s === "active";
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em]"
      style={{
        background: isRunning
          ? "color-mix(in oklab, var(--color-ua) 14%, transparent)"
          : "var(--surface-hover)",
        color: isRunning ? "var(--color-ua)" : "var(--text-muted)",
      }}
    >
      {isRunning && <LivePulse accent="mint" size={6} />}
      {state}
    </span>
  );
}

function KpiStrip({ summary }: { summary: CampaignSummary }) {
  const kpis = [
    {
      id: "cpaD7",
      label: "CPA D7",
      value: summary.cpa_d7 != null ? fmtCpi(summary.cpa_d7) : "—",
      delta: pctOrNull(summary.cpaD7Delta),
      direction: "lower-better" as const,
      hint: "spend ÷ subscribers at D7",
      highlight: true,
    },
    {
      id: "spend",
      label: "Spend",
      value: fmtMoney(summary.spend),
      delta: pctOrNull(summary.spendDelta),
      direction: "higher-better" as const,
      hint: "what we paid for ads in this window",
      highlight: false,
    },
    {
      id: "installs",
      label: "Installs",
      value: summary.installs.toLocaleString(),
      delta: pctOrNull(summary.installsDelta),
      direction: "higher-better" as const,
      hint: "people who downloaded the app",
      highlight: false,
    },
    {
      id: "roiD7",
      label: "ROI D7",
      value: `${summary.roi_d7.toFixed(2)}x`,
      delta: pctOrNull(summary.roiD7Delta),
      direction: "higher-better" as const,
      hint: "cohort D7 revenue ÷ spend",
      highlight: false,
    },
  ];

  return (
    <section
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
      data-testid="profile-kpi-strip"
    >
      {kpis.map((k, i) => (
        <KpiCard
          key={k.id}
          id={k.id}
          label={k.label}
          value={k.value}
          delta={k.delta}
          direction={k.direction}
          hint={k.hint}
          highlight={k.highlight}
          size="compact"
          enterIndex={i + 1}
        />
      ))}
    </section>
  );
}

function ProfileTrendChart({ trend }: { trend: CampaignTrendPoint[] }) {
  // Translate the campaign-trend shape to the dashboard's TrendPoint
  // shape so the existing TrendChart renders without a rebuild. Fields
  // we don't have stay at 0 — the chart hides metric tabs for which
  // every point reads 0.
  const adapted: TrendPoint[] = useMemo(
    () =>
      trend.map((p) => ({
        date: p.date.slice(5, 10),
        spend: Math.round(p.spend),
        installs: Math.round(p.installs),
        cpi: +p.cpi.toFixed(2),
        roas: +p.roi_d7.toFixed(2),
        subStart: p.sub_start_d7 != null ? Math.round(p.sub_start_d7) : 0,
        subD7: p.sub_d7 != null ? Math.round(p.sub_d7) : 0,
        cpaD7: p.cpa_d7 != null ? +p.cpa_d7.toFixed(2) : 0,
      })),
    [trend],
  );

  if (adapted.length === 0) {
    return (
      <GlassCard className="flex flex-col gap-2 p-6" data-testid="profile-trend-empty">
        <h3 className="font-display text-md font-bold leading-none text-cloud-white">
          Daily trend
        </h3>
        <p className="font-body text-xs text-[color:var(--text-muted)]">
          No daily data points in the active window.
        </p>
      </GlassCard>
    );
  }

  return <TrendChart trend={adapted} enterIndex={5} initialMetric="cpaD7" />;
}

const fmtMoney = (n: number) =>
  n >= 1000 ? `$${Math.round(n).toLocaleString()}` : `$${n.toFixed(2)}`;
const fmtCpi = (n: number) => `$${n.toFixed(2)}`;
const pctOrNull = (frac: number | null): number | null =>
  frac == null ? null : +(frac * 100).toFixed(1);
