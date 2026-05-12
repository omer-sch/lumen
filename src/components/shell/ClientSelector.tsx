"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Check, ChevronDown, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { CLIENTS } from "@/lib/mock/clients";
import { useGlobalFilters } from "@/lib/filters/use-global-filters";

const LIMITED_COVERAGE_LABEL: Record<string, string> = {
  playw3: "Limited: Meta & Twitter only",
};

export function ClientSelector() {
  const { client, setClient } = useGlobalFilters();
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

  const active = CLIENTS.find((c) => c.slug === client) ?? CLIENTS[0];
  const coverageWarning = LIMITED_COVERAGE_LABEL[active.slug];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        data-testid="client-select"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "inline-flex items-center gap-2 rounded-md px-2.5 py-1.5 font-body text-xs font-semibold uppercase tracking-wider text-ua transition-[transform,background-color,color,border-color] duration-280 ease-out-quart hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ua focus-visible:ring-offset-2 focus-visible:ring-offset-navy",
        )}
        style={{
          background: "var(--color-ua-dim)",
          border:
            "1px solid color-mix(in oklab, var(--color-ua) 35%, transparent)",
        }}
      >
        <Users className="h-3.5 w-3.5" strokeWidth={2} />
        <span>{active.name}</span>
        <ChevronDown
          className={cn(
            "h-3 w-3 transition-transform duration-280 ease-out-quart",
            open && "rotate-180",
          )}
          strokeWidth={2.25}
        />
      </button>

      {coverageWarning && (
        <span
          data-testid="client-coverage-warning"
          className="ml-2 hidden items-center gap-1 rounded-full px-2 py-0.5 font-body text-[10px] font-semibold uppercase tracking-wider md:inline-flex"
          style={{
            background: "color-mix(in oklab, var(--color-ua) 14%, transparent)",
            color: "var(--color-ua)",
            border:
              "1px solid color-mix(in oklab, var(--color-ua) 30%, transparent)",
          }}
        >
          <AlertCircle className="h-3 w-3" strokeWidth={2.25} />
          {coverageWarning}
        </span>
      )}

      {open && (
        <ul
          role="listbox"
          aria-label="Client"
          className="absolute right-0 top-[calc(100%+8px)] z-50 min-w-[240px] overflow-hidden rounded-md py-1 shadow-elevated"
          style={{
            background:
              "color-mix(in oklab, var(--surface-elevated) 96%, transparent)",
            border: "1px solid var(--border-default)",
          }}
        >
          {CLIENTS.map((c) => {
            const selected = c.slug === active.slug;
            return (
              <li key={c.slug}>
                <button
                  type="button"
                  data-testid={`client-option-${c.slug}`}
                  onClick={() => {
                    setClient(c.slug);
                    setOpen(false);
                  }}
                  role="option"
                  aria-selected={selected}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 px-3 py-2 text-left transition-colors duration-280 ease-out-quart hover:bg-[color:var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ua focus-visible:ring-offset-2 focus-visible:ring-offset-navy",
                    selected ? "text-ua" : "text-[color:var(--text-secondary)]",
                  )}
                >
                  <div className="flex flex-col">
                    <span className="font-body text-sm font-semibold leading-none">
                      {c.name}
                    </span>
                    <span className="mt-1 text-[10px] uppercase tracking-wider text-[color:var(--text-muted)]">
                      {c.vertical}
                    </span>
                  </div>
                  {selected && <Check className="h-3.5 w-3.5 shrink-0" strokeWidth={2.5} />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
