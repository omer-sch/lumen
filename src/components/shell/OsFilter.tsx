"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Smartphone } from "lucide-react";

import { cn } from "@/lib/utils";
import { useGlobalFilters } from "@/lib/filters/use-global-filters";
import type { OsFilter as OsFilterValue } from "@/lib/filters/types";

const OPTIONS: { value: OsFilterValue; label: string }[] = [
  { value: "total", label: "All OS" },
  { value: "ios", label: "iOS" },
  { value: "android", label: "Android" },
  { value: "web", label: "Web" },
];

const SHORT_LABEL: Record<OsFilterValue, string> = {
  total: "All",
  ios: "iOS",
  android: "Android",
  web: "Web",
};

/**
 * Compact dropdown for the OS filter. Replaced the original segmented
 * control because the topbar was already carrying date presets + Custom
 * + client + platform filters + the nav controls — five inline OS chips
 * pushed the row past the viewport on common widths and made the
 * dashboard look "out of place" per the review.
 *
 * Layout: one button shows the active OS (mint accent when narrowed,
 * neutral at Total). Click opens a small listbox; the popover mirrors
 * ClientSelector's shape so the topbar reads as a consistent trio of
 * compact dropdowns alongside the date segmented control.
 */
export function OsFilter() {
  const { os, setOs } = useGlobalFilters();
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

  const narrowed = os !== "total";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        data-testid="os-filter-trigger"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`OS filter: ${SHORT_LABEL[os]}`}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-body text-xs font-semibold uppercase tracking-wider transition-[transform,background-color,color,border-color] duration-280 ease-out-quart hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ua focus-visible:ring-offset-2 focus-visible:ring-offset-navy",
        )}
        style={{
          // Match ClientSelector's visual weight: neutral state uses
          // --border-default (not --border-subtle); the muted neutral
          // text uses --text-secondary (dark-mode), NOT the
          // --text-light-* tokens which are light-mode-only and rendered
          // invisible against the dark topbar.
          background: narrowed
            ? "var(--color-ua-dim)"
            : "var(--surface-input)",
          color: narrowed ? "var(--color-ua)" : "var(--text-secondary)",
          border: narrowed
            ? "1px solid color-mix(in oklab, var(--color-ua) 35%, transparent)"
            : "1px solid var(--border-default)",
        }}
      >
        {/* Icon strokeWidth left at lucide's default so it reads at the
            same weight as ClientSelector's <Users>. Prefix label "OS · "
            dropped per the design review - icon + value is enough. */}
        <Smartphone className="h-3.5 w-3.5" />
        <span>{SHORT_LABEL[os]}</span>
        <ChevronDown
          className={cn(
            "h-3 w-3 transition-transform duration-280 ease-out-quart",
            open && "rotate-180",
          )}
          strokeWidth={2.25}
        />
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="OS filter"
          className="absolute right-0 top-[calc(100%+8px)] z-50 min-w-[180px] overflow-hidden rounded-md py-1 shadow-elevated"
          style={{
            background:
              "color-mix(in oklab, var(--surface-elevated) 96%, transparent)",
            border: "1px solid var(--border-default)",
          }}
        >
          {OPTIONS.map((opt) => {
            const selected = os === opt.value;
            return (
              <li key={opt.value}>
                <button
                  type="button"
                  data-testid={`os-filter-${opt.value}`}
                  onClick={() => {
                    setOs(opt.value);
                    setOpen(false);
                  }}
                  role="option"
                  aria-selected={selected}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors duration-280 ease-out-quart hover:bg-[color:var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ua focus-visible:ring-offset-2 focus-visible:ring-offset-navy",
                    selected ? "text-ua" : "text-[color:var(--text-secondary)]",
                  )}
                >
                  <span className="font-body text-sm font-semibold leading-none">
                    {opt.label}
                  </span>
                  {selected && (
                    <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
