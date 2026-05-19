"use client";

import { useRef } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Film, Globe, Megaphone } from "lucide-react";

import { cn } from "@/lib/utils";

export const CAMPAIGNS_AREA_TABS = ["campaigns", "creatives", "geo"] as const;
export type CampaignsAreaTab = (typeof CAMPAIGNS_AREA_TABS)[number];

type TabMeta = {
  label: string;
  href: string;
  Icon: typeof Megaphone;
  description: string;
};

const TAB_META: Record<CampaignsAreaTab, TabMeta> = {
  campaigns: {
    label: "Campaigns",
    href: "/campaigns",
    Icon: Megaphone,
    description: "One row per campaign across the active window",
  },
  creatives: {
    label: "Creatives",
    href: "/campaigns/creatives",
    Icon: Film,
    description: "Per-ad drilldown ranked by spend",
  },
  geo: {
    label: "Geo",
    href: "/campaigns/geo",
    Icon: Globe,
    description: "Per-country drilldown — donut, map, table",
  },
};

type Props = {
  activeTab: CampaignsAreaTab;
};

/**
 * Lateral tab strip across the three Campaigns-area drill-down lenses.
 * Mirrors DashboardTabs visually (segmented control, mint accent on
 * active, focus-visible ring) but the tabs route to URL segments
 * (`/campaigns/...`) instead of toggling a query param — each lens is
 * its own page with its own queries and skeleton, so URL-as-state is
 * the right shape.
 *
 * Carries the active `?range=` / `?client=` / `?os=` / `?platforms=`
 * query string across tabs so the global filter survives lateral
 * navigation. Links use Next.js `<Link>` so Next prefetches each tab
 * on hover and SSR works without a client roundtrip.
 *
 * Not rendered on the per-campaign profile route (`/campaigns/[id]`):
 * that's a different surface (one campaign deep dive) and cross-area
 * tabs would be confusing there.
 */
export function CampaignsAreaTabs({ activeTab }: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const search = useSearchParams();
  const qs = search.toString();
  const suffix = qs ? `?${qs}` : "";

  const onKeyDown = (e: React.KeyboardEvent<HTMLAnchorElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    // Roving-tabindex pattern: arrows move focus relative to the
    // currently focused tab (not relative to the active one), so a
    // user can scan the strip without activating. Enter activates the
    // focused tab via the underlying <Link>.
    const currentTab = e.currentTarget.dataset.tab as
      | CampaignsAreaTab
      | undefined;
    if (!currentTab) return;
    const idx = CAMPAIGNS_AREA_TABS.indexOf(currentTab);
    const next =
      e.key === "ArrowRight"
        ? CAMPAIGNS_AREA_TABS[(idx + 1) % CAMPAIGNS_AREA_TABS.length]
        : CAMPAIGNS_AREA_TABS[
            (idx - 1 + CAMPAIGNS_AREA_TABS.length) % CAMPAIGNS_AREA_TABS.length
          ];
    requestAnimationFrame(() => {
      const node = listRef.current?.querySelector<HTMLAnchorElement>(
        `[data-tab="${next}"]`,
      );
      node?.focus();
    });
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label="Campaigns drill-down lens"
      data-testid="campaigns-area-tabs"
      className="flex items-center gap-1 self-start rounded-md p-1"
      style={{
        background: "var(--surface-input)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      {CAMPAIGNS_AREA_TABS.map((t) => {
        const meta = TAB_META[t];
        const Icon = meta.Icon;
        const active = activeTab === t;
        return (
          <Link
            key={t}
            href={`${meta.href}${suffix}`}
            role="tab"
            data-tab={t}
            data-testid={`campaigns-area-tab-${t}`}
            id={`campaigns-area-tab-${t}`}
            aria-selected={active}
            aria-controls={`campaigns-area-panel-${t}`}
            tabIndex={active ? 0 : -1}
            onKeyDown={onKeyDown}
            title={meta.description}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-sm px-3 py-1.5 font-body text-xs font-semibold uppercase tracking-wider transition-[transform,background-color,color,box-shadow] duration-280 ease-out-quart hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ua focus-visible:ring-offset-2 focus-visible:ring-offset-navy",
              active
                ? "text-ua"
                : "text-[color:var(--text-muted)] hover:text-[color:var(--text-secondary)]",
            )}
            style={
              active
                ? {
                    background: "var(--color-ua-dim)",
                    boxShadow:
                      "inset 0 0 0 1px color-mix(in oklab, var(--color-ua) 35%, transparent)",
                  }
                : undefined
            }
          >
            <Icon className="h-3.5 w-3.5" strokeWidth={2} />
            {meta.label}
          </Link>
        );
      })}
    </div>
  );
}
