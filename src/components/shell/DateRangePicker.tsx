"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarRange, Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useGlobalFilters,
  type DateRangePreset,
} from "@/lib/filters/use-global-filters";

const PRESETS: { value: Exclude<DateRangePreset, "custom">; label: string }[] = [
  { value: "7d",  label: "7d"  },
  { value: "14d", label: "14d" },
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
];

const fmtDay = (d: Date) =>
  d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export function DateRangePicker() {
  const { range, from, to, setRange, setCustomRange } = useGlobalFilters();
  const [customOpen, setCustomOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(() => from.toISOString().slice(0, 10));
  const [draftTo, setDraftTo] = useState(() => to.toISOString().slice(0, 10));
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDraftFrom(from.toISOString().slice(0, 10));
    setDraftTo(to.toISOString().slice(0, 10));
  }, [from, to]);

  useEffect(() => {
    if (!customOpen) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setCustomOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCustomOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [customOpen]);

  const isCustom = range === "custom";

  const apply = () => {
    const f = new Date(`${draftFrom}T00:00:00Z`);
    const t = new Date(`${draftTo}T00:00:00Z`);
    if (Number.isFinite(f.getTime()) && Number.isFinite(t.getTime()) && f <= t) {
      setCustomRange(f, t);
      setCustomOpen(false);
    }
  };

  return (
    <div ref={ref} className="relative flex items-center gap-1.5">
      {/* Preset segmented control */}
      <div
        role="group"
        aria-label="Date range"
        className="flex items-center gap-1 rounded-md p-1"
        style={{
          background: "var(--surface-input)",
          border: "1px solid var(--border-subtle)",
        }}
      >
        {PRESETS.map((p) => {
          const active = range === p.value;
          return (
            <button
              key={p.value}
              type="button"
              data-testid={`date-range-${p.value}`}
              onClick={() => setRange(p.value)}
              aria-pressed={active}
              className={cn(
                "rounded-sm px-2.5 py-1 font-body text-xs font-semibold uppercase tracking-wider transition-[transform,background-color,color,box-shadow] duration-280 ease-out-quart hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ua focus-visible:ring-offset-2 focus-visible:ring-offset-navy",
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
              {p.label}
            </button>
          );
        })}
      </div>

      {/* Custom range trigger */}
      <button
        type="button"
        data-testid="date-range-custom"
        onClick={() => {
          if (!isCustom) setRange("custom");
          setCustomOpen((o) => !o);
        }}
        aria-pressed={isCustom}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-body text-xs font-semibold uppercase tracking-wider transition-[transform,background-color,color,border-color] duration-280 ease-out-quart hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ua focus-visible:ring-offset-2 focus-visible:ring-offset-navy",
          isCustom ? "text-ua" : "text-[color:var(--text-muted)] hover:text-[color:var(--text-secondary)]",
        )}
        style={{
          background: isCustom ? "var(--color-ua-dim)" : "transparent",
          border: isCustom
            ? "1px solid color-mix(in oklab, var(--color-ua) 35%, transparent)"
            : "1px solid var(--border-subtle)",
        }}
      >
        <CalendarRange className="h-3.5 w-3.5" strokeWidth={2} />
        {isCustom ? `${fmtDay(from)} – ${fmtDay(to)}` : "Custom"}
        <ChevronDown
          className={cn(
            "h-3 w-3 transition-transform duration-280 ease-out-quart",
            customOpen && "rotate-180",
          )}
          strokeWidth={2.25}
        />
      </button>

      {customOpen && (
        <div
          role="dialog"
          aria-label="Custom date range"
          className="absolute right-0 top-[calc(100%+8px)] z-50 flex w-[280px] flex-col gap-3 rounded-lg p-4 shadow-elevated"
          style={{
            background:
              "color-mix(in oklab, var(--surface-elevated) 96%, transparent)",
            border: "1px solid var(--border-default)",
          }}
        >
          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--text-muted)]">
              From
            </label>
            <input
              type="date"
              value={draftFrom}
              onChange={(e) => setDraftFrom(e.target.value)}
              className="rounded-md px-2 py-1.5 font-body text-sm text-cloud-white outline-none focus:ring-2 focus:ring-ua"
              style={{
                background: "var(--surface-input)",
                border: "1px solid var(--border-default)",
                colorScheme: "dark",
              }}
            />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--text-muted)]">
              To
            </label>
            <input
              type="date"
              value={draftTo}
              onChange={(e) => setDraftTo(e.target.value)}
              className="rounded-md px-2 py-1.5 font-body text-sm text-cloud-white outline-none focus:ring-2 focus:ring-ua"
              style={{
                background: "var(--surface-input)",
                border: "1px solid var(--border-default)",
                colorScheme: "dark",
              }}
            />
          </div>
          <button
            type="button"
            onClick={apply}
            className="inline-flex items-center justify-center gap-1.5 rounded-md bg-yellow px-3 py-2 font-body text-xs font-semibold text-navy transition-[transform,box-shadow] duration-280 ease-out-quart hover:-translate-y-px active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ua focus-visible:ring-offset-2 focus-visible:ring-offset-navy"
          >
            <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
            Apply
          </button>
        </div>
      )}
    </div>
  );
}
