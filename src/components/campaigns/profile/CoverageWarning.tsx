"use client";

import { InfoCallout } from "@/components/ui/InfoCallout";
import type { CampaignSummary } from "@/types/dashboard";

/**
 * Inline coverage warnings for known data gaps that affect this
 * campaign's reading. Today we only flag AppLovin pre-coverage; the
 * full coverage matrix lives on the Attribution tab and is the
 * authoritative surface — this profile-page callout is the
 * "you should know about this for THIS campaign" subset.
 */
export function CoverageWarning({
  summary,
  from,
}: {
  summary: CampaignSummary;
  from: Date;
}) {
  // AppLovin started reporting to the warehouse on 2026-05-05; any
  // window starting earlier reads partial data.
  const applovinCutoff = new Date(Date.UTC(2026, 4, 5));
  const isApplovin =
    summary.network.toLowerCase().includes("applovin") ||
    summary.network.toLowerCase().startsWith("axon by applovin");
  if (isApplovin && from < applovinCutoff) {
    return (
      <InfoCallout
        title="Limited AppLovin coverage"
        body="AppLovin data lands in the warehouse starting 2026-05-05. Metrics for windows starting earlier are partial; spend / installs predating that date are not reflected."
        data-testid="profile-coverage-applovin"
      />
    );
  }
  return null;
}
