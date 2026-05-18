"use client";

import { useRef } from "react";
import { Activity, ShieldCheck, Users } from "lucide-react";

import { cn } from "@/lib/utils";
import { useGlobalFilters } from "@/lib/filters/use-global-filters";
import {
  ALL_DASHBOARD_TABS,
  type DashboardTab,
} from "@/lib/filters/types";

const TAB_META: Record<
  DashboardTab,
  { label: string; Icon: typeof Activity; description: string }
> = {
  performance: {
    label: "Performance",
    Icon: Activity,
    description: "Acquisition story - spend, installs, channels, cadence",
  },
  lifecycle: {
    label: "Lifecycle",
    Icon: Users,
    description: "Subscribers, churn, net sub over time",
  },
  attribution: {
    label: "Attribution",
    Icon: ShieldCheck,
    description: "BCAC, paid vs organic, coverage warnings",
  },
};

/**
 * Three-tab strip below the dashboard header. Mirrors the visual shape
 * of the existing ModeToggle (My / Lumen) - same segmented-control
 * language, mint accent on active, focus-visible ring per brand spec.
 *
 * Keyboard nav: Left / Right arrows cycle through tabs when one is
 * focused. Mouseless analysts can move scopes without leaving the
 * dashboard.
 */
export function DashboardTabs() {
  const { tab, setTab } = useGlobalFilters();
  const listRef = useRef<HTMLDivElement>(null);

  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const idx = ALL_DASHBOARD_TABS.indexOf(tab);
    const next =
      e.key === "ArrowRight"
        ? ALL_DASHBOARD_TABS[(idx + 1) % ALL_DASHBOARD_TABS.length]
        : ALL_DASHBOARD_TABS[
            (idx - 1 + ALL_DASHBOARD_TABS.length) % ALL_DASHBOARD_TABS.length
          ];
    setTab(next);
    // Focus the newly-active button on the next tick so keyboard chain stays.
    requestAnimationFrame(() => {
      const node = listRef.current?.querySelector<HTMLButtonElement>(
        `[data-tab="${next}"]`,
      );
      node?.focus();
    });
  };

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label="Dashboard scope"
      data-testid="dashboard-tabs"
      className="flex items-center gap-1 self-start rounded-md p-1"
      style={{
        background: "var(--surface-input)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      {ALL_DASHBOARD_TABS.map((t) => {
        const meta = TAB_META[t];
        const Icon = meta.Icon;
        const active = tab === t;
        return (
          <button
            key={t}
            type="button"
            role="tab"
            data-tab={t}
            data-testid={`dashboard-tab-${t}`}
            aria-selected={active}
            aria-controls={`dashboard-tab-panel-${t}`}
            tabIndex={active ? 0 : -1}
            onClick={() => setTab(t)}
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
          </button>
        );
      })}
    </div>
  );
}
