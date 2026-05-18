"use client";

import { useEffect, useRef, useState, type ComponentType, type SVGProps } from "react";
import { Check, ChevronDown, Globe, Smartphone } from "lucide-react";

import { cn } from "@/lib/utils";
import { useGlobalFilters } from "@/lib/filters/use-global-filters";
import type { OsFilter as OsFilterValue } from "@/lib/filters/types";

type OsIcon = ComponentType<SVGProps<SVGSVGElement>>;

// Inline brand silhouettes (CC0 simple-icons paths). Lucide doesn't ship
// the Apple bitten-apple or the Android droid head — these are the
// universally-recognized OS marks, so we inline them as filled SVGs
// instead of substituting a generic icon. Sized to match lucide's
// h-4 w-4 default at the call site.
function AppleMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      {...props}
    >
      <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
    </svg>
  );
}

function AndroidMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      {...props}
    >
      <path d="M17.523 15.34a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm-11.046 0a1 1 0 1 1 0-2 1 1 0 0 1 0 2zm11.404-6.158 1.997-3.458a.416.416 0 0 0-.152-.566.416.416 0 0 0-.566.152l-2.022 3.503a12.418 12.418 0 0 0-10.272 0L4.844 5.31a.415.415 0 0 0-.566-.152.415.415 0 0 0-.152.566l1.997 3.458C2.674 11.137.501 14.581 0 18.625h24c-.501-4.044-2.674-7.488-6.119-9.442z" />
    </svg>
  );
}

const OPTIONS: { value: OsFilterValue; label: string; icon: OsIcon }[] = [
  { value: "total",   label: "All OS",  icon: Smartphone },
  { value: "ios",     label: "iOS",     icon: AppleMark },
  { value: "android", label: "Android", icon: AndroidMark },
  { value: "web",     label: "Web",     icon: Globe },
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
  const ActiveIcon =
    OPTIONS.find((o) => o.value === os)?.icon ?? Smartphone;

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
        {/* Trigger icon swaps to the active OS mark — Apple silhouette
            for iOS, Android droid for Android, Globe for Web, generic
            Smartphone at "All". Reads as a real brand affordance, not a
            generic placeholder. */}
        <ActiveIcon className="h-3.5 w-3.5" />
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
            const OptIcon = opt.icon;
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
                  <span className="flex items-center gap-2.5">
                    <OptIcon className="h-4 w-4 shrink-0" />
                    <span className="font-body text-sm font-semibold leading-none">
                      {opt.label}
                    </span>
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
