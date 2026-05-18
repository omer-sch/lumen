"use client";

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

// Translate the IntentChannel slug into the display label
// network-colors.ts keys on (it stores per-network brand tints).
const DISPLAY_NETWORK: Record<PlatformFilterValue, string> = {
  meta: "Meta",
  google: "Google",
  tiktok: "TikTok",
  apple_search_ads: "Apple Search Ads",
  applovin: "AppLovin",
};

/**
 * Multi-select platform chip group. Empty selection means "all
 * platforms" (no filter applied). The "All" chip on the left resets
 * the selection.
 */
export function PlatformFilter() {
  const { platforms, setPlatforms } = useGlobalFilters();
  const isAll = platforms.length === 0;

  const toggle = (p: PlatformFilterValue) => {
    if (platforms.includes(p)) {
      setPlatforms(platforms.filter((x) => x !== p));
    } else {
      setPlatforms([...platforms, p]);
    }
  };

  return (
    <div
      role="group"
      aria-label="Platform filter"
      className="flex flex-wrap items-center gap-1 rounded-md p-1"
      style={{
        background: "var(--surface-input)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <button
        type="button"
        data-testid="platform-filter-all"
        onClick={() => setPlatforms([])}
        aria-pressed={isAll}
        className="rounded-sm px-2.5 py-1 font-body text-xs font-medium transition-colors"
        style={{
          background: isAll ? "var(--color-ua)" : "transparent",
          color: isAll ? "var(--surface-base)" : "var(--text-light-secondary)",
        }}
      >
        All
      </button>
      {ALL_PLATFORMS.map((p) => {
        const active = platforms.includes(p);
        const accent = networkColor(DISPLAY_NETWORK[p]);
        return (
          <button
            key={p}
            type="button"
            data-testid={`platform-filter-${p}`}
            onClick={() => toggle(p)}
            aria-pressed={active}
            className="rounded-sm px-2.5 py-1 font-body text-xs font-medium transition-colors"
            style={{
              background: active ? accent : "transparent",
              color: active
                ? "var(--surface-base)"
                : "var(--text-light-secondary)",
            }}
          >
            {LABELS[p]}
          </button>
        );
      })}
    </div>
  );
}
