"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CreativeRow } from "@/lib/globalcomix-queries";

export type LocalFilters = {
  campaignNames: string[];
  campaignStatuses: string[];
  adsetNames: string[];
  adNameSearch: string;
  adStatuses: string[];
  countries: string[];
};

type Props = {
  rows: CreativeRow[];
  value: LocalFilters;
  onChange: (next: LocalFilters) => void;
};

/**
 * Six-chip filter row that narrows the visible per-ad rows post-fetch.
 * State is local — owned by `CreativeBreakdownView` and passed in as
 * `value` / `onChange` — so the BQ query never refetches on a chip
 * change. The dropdown options for each multi-select chip are derived
 * from the rows that actually came back.
 *
 * Today wired: campaign name + adset name + ad-name text search.
 * Campaign status / ad status / country chips are placeholders sized
 * for the eventual UI; their dropdowns will populate once the data
 * carries those columns (campaign_status verification per the WS1
 * probe, ad_status from the upcoming Adjust ods, country from a
 * cohort-side groupBy extension).
 */
export function CreativeFilterChips({ rows, value, onChange }: Props) {
  const campaignOptions = useMemo(
    () =>
      distinct(
        rows
          .map((r) => r.campaign_name)
          .filter((s): s is string => !!s && s.length > 0),
      ),
    [rows],
  );
  const adsetOptions = useMemo(
    () =>
      distinct(
        rows
          .map((r) => r.adset_name)
          .filter((s): s is string => !!s && s.length > 0),
      ),
    [rows],
  );

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      data-testid="creative-filter-chips"
    >
      <MultiSelectChip
        testId="chip-campaign"
        label="Campaign"
        options={campaignOptions}
        selected={value.campaignNames}
        onChange={(campaignNames) => onChange({ ...value, campaignNames })}
      />
      <MultiSelectChip
        testId="chip-adset"
        label="Adset"
        options={adsetOptions}
        selected={value.adsetNames}
        onChange={(adsetNames) => onChange({ ...value, adsetNames })}
      />
      <SearchChip
        testId="chip-ad-name"
        value={value.adNameSearch}
        onChange={(adNameSearch) => onChange({ ...value, adNameSearch })}
      />
      {/* Placeholder chips for the WS1-probe-dependent dimensions. They
          are disabled until the supporting columns are confirmed; the
          spec calls these out as conditionally-mounted but rendering
          them dim keeps the filter row's visual rhythm. */}
      <PlaceholderChip testId="chip-campaign-status" label="Campaign Status" />
      <PlaceholderChip testId="chip-ad-status" label="Ad Status" />
      <PlaceholderChip testId="chip-country" label="Country" />
    </div>
  );
}

function MultiSelectChip({
  testId,
  label,
  options,
  selected,
  onChange,
}: {
  testId: string;
  label: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = selected.length > 0;
  const summary = active
    ? selected.length === 1
      ? truncate(selected[0], 18)
      : `${selected.length} selected`
    : "All";

  const toggle = (opt: string) => {
    const next = selected.includes(opt)
      ? selected.filter((s) => s !== opt)
      : [...selected, opt];
    onChange(next);
  };

  return (
    <div className="relative">
      <button
        type="button"
        data-testid={`${testId}-toggle`}
        aria-pressed={active}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-body text-xs font-semibold uppercase tracking-wider transition-[transform,background-color,color,border-color] duration-280 ease-out-quart hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ua focus-visible:ring-offset-2 focus-visible:ring-offset-navy",
          active
            ? "text-ua"
            : "text-[color:var(--text-muted)] hover:text-[color:var(--text-secondary)]",
        )}
        style={{
          background: active ? "var(--color-ua-dim)" : "transparent",
          borderColor: active
            ? "color-mix(in oklab, var(--color-ua) 35%, transparent)"
            : "var(--border-subtle)",
        }}
      >
        {label}: <span className="normal-case tracking-normal">{summary}</span>
        <ChevronDown className="h-3 w-3" strokeWidth={2.5} />
      </button>
      {open && (
        <div
          data-testid={`${testId}-menu`}
          className="absolute left-0 top-full z-30 mt-1 max-h-72 w-64 overflow-auto rounded-md p-1 font-body text-xs shadow-lg"
          style={{
            background: "var(--surface-glass-solid, var(--surface-base))",
            border: "1px solid var(--border-glass)",
          }}
        >
          {options.length === 0 && (
            <p className="px-2 py-1.5 text-[color:var(--text-muted)]">
              No options in the current window.
            </p>
          )}
          {options.map((opt) => {
            const isOn = selected.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                data-testid={`${testId}-opt-${opt}`}
                onClick={() => toggle(opt)}
                className={cn(
                  "flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left hover:bg-[color:var(--surface-hover)]",
                  isOn && "text-ua",
                )}
              >
                <span className="truncate" title={opt}>
                  {opt}
                </span>
                {isOn && <Check className="h-3 w-3 shrink-0" strokeWidth={2.5} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SearchChip({
  testId,
  value,
  onChange,
}: {
  testId: string;
  value: string;
  onChange: (next: string) => void;
}) {
  const active = value.length > 0;
  return (
    <label
      data-testid={testId}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-body text-xs font-semibold uppercase tracking-wider transition-colors duration-280 ease-out-quart",
        active ? "text-ua" : "text-[color:var(--text-muted)]",
      )}
      style={{
        background: active ? "var(--color-ua-dim)" : "transparent",
        borderColor: active
          ? "color-mix(in oklab, var(--color-ua) 35%, transparent)"
          : "var(--border-subtle)",
      }}
    >
      <Search className="h-3 w-3" strokeWidth={2.5} />
      <span>Ad Name</span>
      <input
        type="text"
        data-testid={`${testId}-input`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="search…"
        className="w-32 bg-transparent normal-case tracking-normal text-cloud-white outline-none placeholder:text-[color:var(--text-muted)]"
      />
      {active && (
        <button
          type="button"
          aria-label="Clear ad name search"
          data-testid={`${testId}-clear`}
          onClick={() => onChange("")}
          className="text-[color:var(--text-muted)] hover:text-cloud-white"
        >
          <X className="h-3 w-3" strokeWidth={2.5} />
        </button>
      )}
    </label>
  );
}

function PlaceholderChip({
  testId,
  label,
}: {
  testId: string;
  label: string;
}) {
  return (
    <span
      data-testid={testId}
      aria-disabled="true"
      title="Coming soon — column verification pending"
      className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-full border px-3 py-1 font-body text-xs font-semibold uppercase tracking-wider text-[color:var(--text-muted)] opacity-50"
      style={{
        background: "transparent",
        borderColor: "var(--border-subtle)",
      }}
    >
      {label}
      <ChevronDown className="h-3 w-3" strokeWidth={2.5} />
    </span>
  );
}

function distinct(items: string[]): string[] {
  return Array.from(new Set(items)).sort((a, b) => a.localeCompare(b));
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}
