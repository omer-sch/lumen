"use client";

import { BcacHeadline } from "@/components/dashboard/BcacHeadline";
import {
  PaidVsOrganic,
  PaidVsOrganicMix,
} from "@/components/dashboard/PaidVsOrganic";
import { DataFreshnessBar } from "@/components/dashboard/DataFreshnessBar";
import { GlassCard } from "@/components/ui/GlassCard";
import { AlertTriangle } from "lucide-react";

/**
 * Attribution tab - the trust story. Layout:
 *
 *   Row 1 (2-col on md+): BCAC hero KpiCard | Paid vs Organic mix donut
 *   Row 2 (full-width):   Paid vs Organic KPI strip (Sub Total / Paid / Organic)
 *   Row 3 (full-width):   Coverage warnings
 *   Row 4 (full-width):   Data freshness
 *
 * The top row pairs the headline metric (BCAC) with the share-of-cohort
 * visual so a CSM gets "what it costs" and "where it came from" in one
 * glance. The KPI strip lives below as the supporting absolute counts.
 *
 * Filters relevant on this tab: Date, OS, Platform, Client (all four).
 * The TopBar shows the OS + Platform chips the same way Performance
 * does because Attribution data also slices by network / OS.
 *
 * The Coverage Warnings panel inlines the three open BQ-investigation
 * questions Gabby still owes us answers on. Surfaced here so a CSM /
 * analyst can see, in plain language, which data sources are partial
 * or stale before reading the numbers above.
 */
export function AttributionTab() {
  return (
    <div
      className="flex flex-col gap-3 md:gap-4"
      data-testid="attribution-tab"
      id="dashboard-tab-panel-attribution"
      role="tabpanel"
      aria-labelledby="dashboard-tab-attribution"
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4">
        <BcacHeadline />
        <PaidVsOrganicMix />
      </div>
      <PaidVsOrganic />
      <CoverageWarnings />
      <DataFreshnessBar />
    </div>
  );
}

/**
 * Inline coverage warnings panel. Three known data-source caveats that
 * the analyst should keep in mind when reading Attribution numbers.
 * Static for now - a future iteration can drive these from a /api/bq
 * call once the data team formalizes a coverage manifest.
 */
function CoverageWarnings() {
  const warnings: { title: string; body: string }[] = [
    {
      title: "AppLovin coverage starts 2026-05-05",
      body:
        "Windows that include dates before 2026-05-05 will read AppLovin spend as zero. " +
        "The other paid networks (Meta, Google, TikTok, Apple Search Ads) cover the full history.",
    },
    {
      title: "SKAdNetwork ingestion stale since 2025-08-04",
      body:
        "ods_adjust_skad_report_globalcomix stopped landing rows on 2025-08-04. " +
        "iOS SKAdNetwork-attributed installs / subs from after that date are missing; " +
        "Adjust attribution still flows and is the headline source on this dashboard.",
    },
    {
      title: "Pubmint attribution flows without matching spend",
      body:
        "~7.7k cohort rows / 90 days come back under the 'Pubmint iOS' / 'Pubmint Android' " +
        "_Network_Attribution strings, but no matching dwh_pubmint_* spend table exists today. " +
        "Those subs currently fall into the NULL bucket (dropped from paid totals) and are " +
        "awaiting Gabby's call on whether to count as paid or organic.",
    },
  ];

  return (
    <GlassCard className="flex flex-col gap-3 p-4">
      <header className="flex items-start gap-2">
        <AlertTriangle
          className="h-4 w-4 shrink-0 text-[color:var(--color-yellow)] mt-0.5"
          strokeWidth={2}
        />
        <div className="flex flex-col gap-0.5">
          <h3 className="font-display text-md font-bold leading-none text-cloud-white">
            Coverage warnings
          </h3>
          <p className="font-body text-xs text-[color:var(--text-muted)]">
            Known data-source caveats that shape what Attribution can say.
          </p>
        </div>
      </header>
      <ul className="flex flex-col gap-2">
        {warnings.map((w) => (
          <li
            key={w.title}
            className="flex flex-col gap-1 rounded-md p-3"
            style={{
              background: "var(--surface-input)",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <span className="font-body text-sm font-semibold text-[color:var(--text-primary)]">
              {w.title}
            </span>
            <span className="font-body text-xs leading-relaxed text-[color:var(--text-secondary)]">
              {w.body}
            </span>
          </li>
        ))}
      </ul>
    </GlassCard>
  );
}
