"use client";

import { Suspense, useMemo } from "react";
import { Megaphone } from "lucide-react";
import { GlassIcon } from "@/components/ui/GlassIcon";
import { LivePulse } from "@/components/ui/LivePulse";
import { useGlobalFilters } from "@/lib/filters/use-global-filters";
import { findClient } from "@/lib/mock/clients";
import { getCampaigns } from "@/lib/mock/campaigns";
import { CampaignsTable } from "./CampaignsTable";

export function CampaignsView() {
  return (
    <Suspense fallback={null}>
      <CampaignsInner />
    </Suspense>
  );
}

function CampaignsInner() {
  const { from, to, client } = useGlobalFilters();
  const days = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
  const c = findClient(client);
  const rows = useMemo(
    () => getCampaigns({ from, to, client }),
    [from, to, client],
  );

  return (
    <div className="flex flex-col gap-8 py-2 md:gap-10">
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
            Campaigns
          </h2>
          <p className="max-w-2xl font-body text-sm text-[color:var(--text-secondary)]">
            One row per campaign across the active window. Sort any column,
            scope to a single channel, and read each row&apos;s 7-day trend at a
            glance — the same drill-down a UA analyst opens when a number on
            the dashboard moves.
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

      <CampaignsTable rows={rows} />
    </div>
  );
}
