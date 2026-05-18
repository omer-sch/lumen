"use client";

import { useGlobalFilters } from "@/lib/filters/use-global-filters";
import { ALL_OS, type OsFilter as OsFilterValue } from "@/lib/filters/types";

const OPTIONS: { value: OsFilterValue; label: string }[] = [
  { value: "total", label: "Total" },
  { value: "ios", label: "iOS" },
  { value: "android", label: "Android" },
  { value: "web", label: "Web" },
];

/**
 * Headline OS segmented control. Mirrors DateRangePicker's preset
 * control shape so the topbar reads as one row of consistent chips.
 * Default selection is Total (no narrowing).
 */
export function OsFilter() {
  const { os, setOs } = useGlobalFilters();

  return (
    <div
      role="group"
      aria-label="OS filter"
      className="flex items-center gap-1 rounded-md p-1"
      style={{
        background: "var(--surface-input)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      {OPTIONS.map((opt) => {
        const active = os === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            data-testid={`os-filter-${opt.value}`}
            onClick={() => setOs(opt.value)}
            aria-pressed={active}
            className="rounded-sm px-2.5 py-1 font-body text-xs font-medium transition-colors"
            style={{
              background: active ? "var(--color-ua)" : "transparent",
              color: active
                ? "var(--surface-base)"
                : "var(--text-light-secondary)",
            }}
          >
            {opt.label}
          </button>
        );
      })}
      {/* Reading-aid for screen readers: announce when narrowing is active. */}
      {os !== "total" && (
        <span className="sr-only">{`OS filter narrowed to ${os}`}</span>
      )}
      {/* Hidden anchor so the linter / future tests can find the canonical
          list of options without re-importing the constant. */}
      <span className="hidden" data-os-options={ALL_OS.join(",")} />
    </div>
  );
}
