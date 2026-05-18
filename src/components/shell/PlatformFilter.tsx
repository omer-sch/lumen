"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Network as NetworkIcon, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { useGlobalFilters } from "@/lib/filters/use-global-filters";
import {
  ALL_PLATFORMS,
  type PlatformFilter as PlatformFilterValue,
} from "@/lib/filters/types";
import { networkColor } from "@/lib/dashboard/network-colors";

const LABELS: Record<PlatformFilterValue, string> = {
  meta: "Meta",
  google: "Google",
  tiktok: "TikTok",
  apple_search_ads: "ASA",
  applovin: "AppLovin",
};

// IntentChannel slug -> network-colors.ts display key.
const DISPLAY_NETWORK: Record<PlatformFilterValue, string> = {
  meta: "Meta",
  google: "Google",
  tiktok: "TikTok",
  apple_search_ads: "Apple Search Ads",
  applovin: "AppLovin",
};

/**
 * Compact multi-select dropdown for the platform filter. Originally
 * shipped as an inline chip group (5 brand-colored chips + an All
 * reset) which combined with the OS chips pushed the topbar past the
 * viewport on common widths.
 *
 * Layout now: one button summarizes selection ("All platforms" / a
 * single platform name / "N platforms"). Click opens a checkbox-list
 * popover. The active platforms still tint with their network color
 * inside the popover, so the brand-color convention survives where it
 * actually matters (the selection surface), without crowding the topbar
 * with five always-visible chips.
 */
export function PlatformFilter() {
  const { platforms, setPlatforms } = useGlobalFilters();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const isAll = platforms.length === 0;
  const narrowed = !isAll;

  const summary = isAll
    ? "All"
    : platforms.length === 1
      ? LABELS[platforms[0]]
      : `${platforms.length} selected`;

  const toggle = (p: PlatformFilterValue) => {
    if (platforms.includes(p)) {
      setPlatforms(platforms.filter((x) => x !== p));
    } else {
      setPlatforms([...platforms, p]);
    }
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        data-testid="platform-filter-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Platform filter: ${summary}`}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-body text-xs font-semibold uppercase tracking-wider transition-[transform,background-color,color,border-color] duration-280 ease-out-quart hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ua focus-visible:ring-offset-2 focus-visible:ring-offset-navy",
        )}
        style={{
          background: narrowed
            ? "var(--color-ua-dim)"
            : "var(--surface-input)",
          color: narrowed ? "var(--color-ua)" : "var(--text-light-secondary)",
          border: narrowed
            ? "1px solid color-mix(in oklab, var(--color-ua) 35%, transparent)"
            : "1px solid var(--border-subtle)",
        }}
      >
        <NetworkIcon className="h-3.5 w-3.5" strokeWidth={2} />
        <span className="hidden sm:inline">Channels ·</span>
        <span>{summary}</span>
        <ChevronDown
          className={cn(
            "h-3 w-3 transition-transform duration-280 ease-out-quart",
            open && "rotate-180",
          )}
          strokeWidth={2.25}
        />
      </button>

      {open && (
        <div
          role="listbox"
          aria-label="Platform filter"
          aria-multiselectable="true"
          className="absolute right-0 top-[calc(100%+8px)] z-50 min-w-[220px] overflow-hidden rounded-md py-1 shadow-elevated"
          style={{
            background:
              "color-mix(in oklab, var(--surface-elevated) 96%, transparent)",
            border: "1px solid var(--border-default)",
          }}
        >
          <ul className="flex flex-col">
            {ALL_PLATFORMS.map((p) => {
              const active = platforms.includes(p);
              const accent = networkColor(DISPLAY_NETWORK[p]);
              return (
                <li key={p}>
                  <button
                    type="button"
                    data-testid={`platform-filter-${p}`}
                    onClick={() => toggle(p)}
                    role="option"
                    aria-selected={active}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors duration-280 ease-out-quart hover:bg-[color:var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ua focus-visible:ring-offset-2 focus-visible:ring-offset-navy",
                      active
                        ? "text-cloud-white"
                        : "text-[color:var(--text-secondary)]",
                    )}
                  >
                    <span className="inline-flex items-center gap-2">
                      <span
                        aria-hidden
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{
                          background: active ? accent : "transparent",
                          border: `1.5px solid ${accent}`,
                        }}
                      />
                      <span className="font-body text-sm font-semibold leading-none">
                        {LABELS[p]}
                      </span>
                    </span>
                    {active && (
                      <Check
                        className="h-3.5 w-3.5 shrink-0"
                        strokeWidth={2.5}
                      />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          {narrowed && (
            <div
              className="mt-1 border-t px-2 py-1.5"
              style={{ borderColor: "var(--border-subtle)" }}
            >
              <button
                type="button"
                data-testid="platform-filter-clear"
                onClick={() => {
                  setPlatforms([]);
                  setOpen(false);
                }}
                className="inline-flex items-center gap-1.5 rounded-sm px-2 py-1 font-body text-xs font-semibold uppercase tracking-wider text-[color:var(--text-muted)] transition-colors duration-280 ease-out-quart hover:text-[color:var(--text-secondary)]"
              >
                <X className="h-3 w-3" strokeWidth={2.5} />
                Clear selection
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
