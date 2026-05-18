"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { GlassCard } from "@/components/ui/GlassCard";
import { useCampaignsData } from "@/lib/campaigns/use-campaigns-data";
import { useGlobalFilters } from "@/lib/filters/use-global-filters";
import { enrichCampaignRow } from "@/lib/analyst/campaign-classifier";

type Props = {
  campaignId: string;
  family: string;
  geo: string;
};

/**
 * Side-by-side comparison of up to five other campaigns matching the
 * active campaign's family + geo. Drives off the same /api/bq/campaigns
 * endpoint the index uses — a second fetch costs nothing because the
 * route is cached server-side and the Redis-cached payload is small.
 *
 * The active campaign's row is rendered with a mint background so
 * "this is the campaign you came from" is unmistakable at a glance.
 */
export function PeerComparison({ campaignId, family, geo }: Props) {
  const { from, to, client, os, platforms } = useGlobalFilters();
  const { rows, loading } = useCampaignsData({
    from,
    to,
    client,
    os,
    platforms,
  });

  const params = useSearchParams();
  const query = params.toString();

  const peers = useMemo(() => {
    if (!rows) return [];
    const enriched = rows.map((r) => enrichCampaignRow(r));
    const here = enriched.find((r) => r.campaign_id === campaignId);
    const candidates = enriched.filter(
      (r) =>
        r.family === family &&
        r.geo === geo &&
        r.campaign_id !== campaignId,
    );
    // Up to 5 peers + the active campaign at the top.
    const top5 = candidates.slice(0, 5);
    return here ? [here, ...top5] : top5;
  }, [rows, campaignId, family, geo]);

  if (loading && peers.length === 0) {
    return null;
  }
  if (peers.length <= 1) {
    return (
      <GlassCard className="flex flex-col gap-2 p-6" data-testid="profile-peers-empty">
        <h3 className="font-display text-md font-bold leading-none text-cloud-white">
          Peer comparison
        </h3>
        <p className="font-body text-xs text-[color:var(--text-muted)]">
          No other campaigns share this family + geo in the active window.
        </p>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="flex flex-col gap-4 p-6" data-testid="profile-peers">
      <div>
        <h3 className="font-display text-md font-bold leading-none text-cloud-white">
          Peer comparison
        </h3>
        <p className="mt-1 font-body text-xs text-[color:var(--text-muted)]">
          Other campaigns in <strong className="text-cloud-white">{family}</strong>{" "}
          · <strong className="text-cloud-white">{geo}</strong>. This campaign is
          highlighted; click a peer to navigate.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm" data-testid="profile-peers-table">
          <thead>
            <tr className="text-[11px] font-semibold uppercase tracking-wider text-[color:var(--text-muted)]">
              <th className="px-3 pb-2 pt-1 text-left">Campaign</th>
              <th className="px-3 pb-2 pt-1 text-right">CPA D7</th>
              <th className="px-3 pb-2 pt-1 text-right">ROI D7</th>
            </tr>
          </thead>
          <tbody>
            {peers.map((p) => {
              const isHere = p.campaign_id === campaignId;
              const href = query
                ? `/campaigns/${p.campaign_id}?${query}`
                : `/campaigns/${p.campaign_id}`;
              return (
                <tr
                  key={p.campaign_id}
                  data-testid={`peer-row-${p.campaign_id}`}
                  data-active={isHere || undefined}
                  className={cn(
                    "border-t border-[color:var(--border-subtle)]",
                    isHere
                      ? ""
                      : "hover:bg-[color:var(--surface-hover)]",
                  )}
                  style={
                    isHere
                      ? {
                          background:
                            "color-mix(in oklab, var(--color-ua) 12%, transparent)",
                        }
                      : undefined
                  }
                >
                  <td className="whitespace-nowrap px-3 py-3">
                    {isHere ? (
                      <span className="font-semibold text-ua">
                        {p.campaign_name || p.campaign_id}
                        <span className="ml-2 text-[10px] uppercase tracking-[0.18em] text-[color:var(--text-muted)]">
                          this campaign
                        </span>
                      </span>
                    ) : (
                      <Link
                        href={href}
                        className="font-medium text-cloud-white transition-colors hover:text-ua"
                      >
                        {p.campaign_name || p.campaign_id}
                      </Link>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-cloud-white">
                    {p.cpa_d7 != null ? `$${p.cpa_d7.toFixed(2)}` : "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-cloud-white">
                    {p.roi_d7.toFixed(2)}x
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </GlassCard>
  );
}
