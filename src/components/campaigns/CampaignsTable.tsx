"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowDown,
  ArrowDownRight,
  ArrowUp,
  ArrowUpRight,
  Check,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { GlassCard } from "@/components/ui/GlassCard";
import { LivePulse } from "@/components/ui/LivePulse";
import { enrichCampaignRow } from "@/lib/analyst/campaign-classifier";
import {
  networkForeground,
  networkTint,
} from "@/lib/dashboard/network-colors";
import type { CampaignRow } from "@/types/dashboard";

type SortKey =
  | "campaign_name"
  | "network"
  | "spend"
  | "installs"
  | "cpi"
  | "cpa_d7"
  | "roi_d7"
  | "spendDelta"
  | "sub_start_d7"
  | "sub_d7";

type SortDir = "asc" | "desc";

type ColumnDef = {
  key: SortKey;
  label: string;
  align: "left" | "right";
  /** When true, only visible after toggling "More". */
  extended?: boolean;
};

const COLUMNS: ColumnDef[] = [
  { key: "campaign_name", label: "Campaign", align: "left" },
  { key: "network",       label: "Network",  align: "left" },
  { key: "spend",         label: "Spend",    align: "right" },
  { key: "installs",      label: "Installs", align: "right" },
  { key: "cpi",           label: "CPI",      align: "right" },
  { key: "cpa_d7",        label: "CPA D7",   align: "right" },
  { key: "roi_d7",        label: "ROI D7",   align: "right" },
  { key: "spendDelta",    label: "Δ Spend",  align: "right" },
  { key: "sub_start_d7",  label: "Sub Start D7", align: "right", extended: true },
  { key: "sub_d7",        label: "Sub D7",       align: "right", extended: true },
];

/**
 * Normalize an Adjust `campaign_status` string to one of the three
 * states the row pill can render. Adjust emits "running" / "paused"
 * but the warehouse occasionally surfaces other tokens ("archived",
 * "active") which we map to the closest visible state.
 */
type StatusState = "running" | "paused" | "unknown";
function normalizeStatus(raw: string | null | undefined): StatusState {
  if (!raw) return "unknown";
  const s = raw.trim().toLowerCase();
  if (s === "running" || s === "active") return "running";
  if (s === "paused" || s === "archived" || s === "deleted") return "paused";
  return "unknown";
}

const STATUS_FILTERS = ["all", "running", "paused"] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

const fmtMoney = (n: number) =>
  `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
const fmtCount = (n: number) => n.toLocaleString();
const fmtCpi = (n: number) => `$${n.toFixed(2)}`;
const fmtRoi = (n: number) => `${n.toFixed(2)}x`;
const fmtDeltaPct = (frac: number | null): string => {
  if (frac == null) return "—";
  return `${(frac * 100).toFixed(1)}%`;
};

type EnrichedRow = ReturnType<typeof enrichCampaignRow>;

type CampaignsTableProps = {
  rows: CampaignRow[];
};

/**
 * Index table. Columns map 1:1 to `CampaignRow` from the BQ wire shape;
 * sort by any column, narrow to a single family / geo / status without
 * touching the global filter. Network scoping lives on the TopBar
 * Channels chip strip — `platforms` is the single source of truth for
 * that dimension and is threaded through `useCampaignsData` into the
 * BQ query.
 *
 * Chip filters live in component-local state — they are scratch filters
 * for investigation, not deep-linkable. The global filter (date / OS /
 * platforms / client) is the deep-linkable spine and stays in the URL.
 */
export function CampaignsTable({ rows }: CampaignsTableProps) {
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: "spend",
    dir: "desc",
  });
  // Multi-select state: empty array = "all" so no filter applies. The
  // dropdown-chip UX naturally collapses to a no-op selection, which
  // reads more honestly than a synthetic "all" sentinel in the array.
  const [families, setFamilies] = useState<string[]>([]);
  const [geos, setGeos] = useState<string[]>([]);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [showMore, setShowMore] = useState(false);

  const params = useSearchParams();
  const profileQuery = params.toString();

  // Classify once — every chip filter and the row renderer read from
  // the enriched view rather than re-parsing the campaign name N times.
  const enriched: EnrichedRow[] = useMemo(
    () => rows.map((r) => enrichCampaignRow(r)),
    [rows],
  );

  // Distinct family / geo values present in the current row set. The
  // chip list is derived from the data rather than hardcoded so a new
  // family appearing in the warehouse (e.g. when GlobalComix adds a
  // new campaign type) shows up automatically without a code change.
  const familyOptions = useMemo(
    () => distinctSorted(enriched, (r) => r.family),
    [enriched],
  );
  const geoOptions = useMemo(
    () => distinctSorted(enriched, (r) => r.geo),
    [enriched],
  );

  const filtered = useMemo(() => {
    return enriched.filter((r) => {
      if (families.length > 0 && !families.includes(r.family)) return false;
      if (geos.length > 0 && !geos.includes(r.geo)) return false;
      if (status !== "all") {
        const s = normalizeStatus(r.campaign_status);
        if (s !== status) return false;
      }
      return true;
    });
  }, [enriched, families, geos, status]);

  const sorted = useMemo(() => {
    const out = [...filtered];
    out.sort((a, b) => {
      const va = sortValue(a, sort.key);
      const vb = sortValue(b, sort.key);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "number" && typeof vb === "number") {
        return sort.dir === "asc" ? va - vb : vb - va;
      }
      const sa = String(va);
      const sb = String(vb);
      return sort.dir === "asc" ? sa.localeCompare(sb) : sb.localeCompare(sa);
    });
    return out;
  }, [filtered, sort]);

  const toggleSort = (key: SortKey) => {
    setSort((cur) =>
      cur.key === key
        ? { key, dir: cur.dir === "asc" ? "desc" : "asc" }
        : {
            key,
            dir: key === "campaign_name" || key === "network" ? "asc" : "desc",
          },
    );
  };

  const visibleColumns = showMore ? COLUMNS : COLUMNS.filter((c) => !c.extended);

  return (
    <GlassCard glow="ua" enterIndex={1} className="flex flex-col gap-5 p-5">
      {/* One compact row of dropdown chips. Each opens a popover with
          its options; empty selection = no filter applied. Replaces
          the prior four stacked chip rows so the table area dominates
          the viewport. */}
      <div className="flex flex-wrap items-center gap-2">
        {familyOptions.length > 1 && (
          <FilterDropdown
            testIdPrefix="campaigns-filter-family"
            label="Family"
            options={familyOptions}
            selected={families}
            onChange={setFamilies}
          />
        )}
        {geoOptions.length > 1 && (
          <FilterDropdown
            testIdPrefix="campaigns-filter-geo"
            label="Geo"
            options={geoOptions}
            selected={geos}
            onChange={setGeos}
          />
        )}
        <SingleSelectDropdown
          testIdPrefix="campaigns-filter-status"
          label="Status"
          options={[
            { value: "all", label: "All" },
            { value: "running", label: "Running" },
            { value: "paused", label: "Paused" },
          ]}
          selected={status}
          onChange={(v) => setStatus(v as StatusFilter)}
        />
        <span className="ml-auto inline-flex items-center gap-2 text-[11px] uppercase tracking-wider text-[color:var(--text-muted)]">
          {sorted.length} campaigns
          <button
            type="button"
            data-testid="campaigns-show-more"
            onClick={() => setShowMore((s) => !s)}
            aria-expanded={showMore}
            className="shrink-0 rounded-sm px-2 py-1 font-body text-[10px] font-semibold uppercase tracking-wider text-[color:var(--text-muted)] transition-colors hover:text-cloud-white"
            style={{
              border: "1px solid var(--border-subtle)",
              background: "var(--surface-input)",
            }}
          >
            {showMore ? "Fewer cols" : "More cols"}
          </button>
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm" data-testid="campaigns-table">
          <thead>
            <tr className="text-[11px] font-semibold uppercase tracking-wider text-[color:var(--text-muted)]">
              {visibleColumns.map((c) => {
                const isActive = sort.key === c.key;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    className={cn(
                      "select-none whitespace-nowrap px-3 pb-2 pt-1",
                      c.align === "right" ? "text-right" : "text-left",
                    )}
                  >
                    <button
                      type="button"
                      data-testid={`sort-${c.key}`}
                      onClick={() => toggleSort(c.key)}
                      className={cn(
                        "inline-flex items-center gap-1 transition-colors duration-280 ease-out-quart hover:text-cloud-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ua focus-visible:ring-offset-2 focus-visible:ring-offset-navy",
                        isActive && "text-ua",
                      )}
                    >
                      {c.label}
                      {isActive &&
                        (sort.dir === "asc" ? (
                          <ArrowUp className="h-3 w-3" strokeWidth={2.5} />
                        ) : (
                          <ArrowDown className="h-3 w-3" strokeWidth={2.5} />
                        ))}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => {
              const bg = networkTint(row.network);
              const fg = networkForeground(row.network);
              const spendDelta = row.spendDelta;
              const deltaTone =
                spendDelta == null
                  ? "neutral"
                  : spendDelta > 0
                    ? "good"
                    : spendDelta < 0
                      ? "bad"
                      : "neutral";
              const DeltaArrow =
                spendDelta != null && spendDelta >= 0 ? ArrowUpRight : ArrowDownRight;
              const href = profileQuery
                ? `/campaigns/${row.campaign_id}?${profileQuery}`
                : `/campaigns/${row.campaign_id}`;
              const statusState = normalizeStatus(row.campaign_status);
              return (
                <tr
                  key={row.campaign_id}
                  data-testid={`campaign-row-${row.campaign_id}`}
                  className="group border-t border-[color:var(--border-subtle)] transition-colors duration-280 ease-out-quart hover:bg-[color:var(--surface-hover)]"
                >
                  <td className="whitespace-nowrap px-3 py-3">
                    <span className="inline-flex items-center gap-2">
                      <StatusDot state={statusState} />
                      <Link
                        href={href}
                        aria-label={`Open ${row.campaign_name}`}
                        className={cn(
                          "font-medium transition-colors duration-280 ease-out-quart focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ua focus-visible:ring-offset-2 focus-visible:ring-offset-navy",
                          i === 0 ? "text-ua" : "text-cloud-white hover:text-ua",
                        )}
                      >
                        {row.campaign_name || row.campaign_id}
                      </Link>
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                      style={{ background: bg, color: fg }}
                    >
                      {row.network || "—"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-[color:var(--text-secondary)]">
                    {fmtMoney(row.spend)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-[color:var(--text-secondary)]">
                    {fmtCount(row.installs)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-[color:var(--text-secondary)]">
                    {row.installs > 0 ? fmtCpi(row.cpi) : "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-cloud-white">
                    {row.cpa_d7 != null ? fmtCpi(row.cpa_d7) : "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-cloud-white">
                    {fmtRoi(row.roi_d7)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right">
                    {spendDelta == null ? (
                      <span className="text-[color:var(--text-muted)]">—</span>
                    ) : (
                      <span
                        className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums"
                        style={{
                          background:
                            deltaTone === "good"
                              ? "var(--tint-success-soft)"
                              : deltaTone === "bad"
                                ? "var(--tint-danger-soft)"
                                : "var(--surface-hover)",
                          color:
                            deltaTone === "good"
                              ? "var(--color-ua)"
                              : deltaTone === "bad"
                                ? "var(--color-creative)"
                                : "var(--text-muted)",
                        }}
                      >
                        <DeltaArrow className="h-3 w-3" strokeWidth={2.5} />
                        {fmtDeltaPct(Math.abs(spendDelta))}
                      </span>
                    )}
                  </td>
                  {showMore && (
                    <>
                      <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-[color:var(--text-secondary)]">
                        {row.sub_start_d7 != null ? fmtCount(row.sub_start_d7) : "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-[color:var(--text-secondary)]">
                        {row.sub_d7 != null ? fmtCount(row.sub_d7) : "—"}
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td
                  colSpan={visibleColumns.length}
                  className="px-3 py-10 text-center font-body text-sm text-[color:var(--text-muted)]"
                >
                  No campaigns match this filter in the active window.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </GlassCard>
  );
}

// ── helpers ───────────────────────────────────────────────────────────────

/** Compact chip button used by all four filter rows. */
function ChipButton({
  testId,
  active,
  label,
  onClick,
}: {
  testId: string;
  active: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full border px-3 py-1 font-body text-xs font-semibold uppercase tracking-wider transition-[transform,background-color,color,border-color] duration-280 ease-out-quart hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ua focus-visible:ring-offset-2 focus-visible:ring-offset-navy",
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
      {label}
    </button>
  );
}

/** Row-level status dot. Mint LivePulse when running, muted dot when
 *  paused, hidden when status is unknown (column was null). Wrapped in
 *  a role=status span so a screen reader announces the row state. */
function StatusDot({ state }: { state: StatusState }) {
  if (state === "running") {
    return (
      <span role="status" aria-label="Running" data-testid="status-running">
        <LivePulse accent="mint" size={7} />
      </span>
    );
  }
  if (state === "paused") {
    return (
      <span
        role="status"
        aria-label="Paused"
        data-testid="status-paused"
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{ background: "var(--text-muted)" }}
      />
    );
  }
  return null;
}

function sortValue(row: EnrichedRow, key: SortKey): string | number | null {
  switch (key) {
    case "campaign_name":
      return row.campaign_name || row.campaign_id;
    case "network":
      return row.network;
    case "spend":
      return row.spend;
    case "installs":
      return row.installs;
    case "cpi":
      return row.cpi;
    case "cpa_d7":
      return row.cpa_d7 ?? null;
    case "roi_d7":
      return row.roi_d7;
    case "spendDelta":
      return row.spendDelta ?? null;
    case "sub_start_d7":
      return row.sub_start_d7 ?? null;
    case "sub_d7":
      return row.sub_d7 ?? null;
  }
}

function distinctSorted<T>(rows: T[], picker: (row: T) => string): string[] {
  const set = new Set<string>();
  for (const row of rows) {
    const v = picker(row);
    if (v && v !== "Unknown") set.add(v);
  }
  return Array.from(set).sort();
}

/** Lower-kebab a label so it's safe inside a `data-testid`. */
function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

// ── Dropdown filter chips ─────────────────────────────────────────────────

/**
 * Multi-select dropdown chip. Renders a pill toggle that opens a popover
 * with a checklist of options. Empty selection reads as "All". The
 * outside-click handler closes the popover so the chip behaves like a
 * native <select> from a keyboard / mouse user's perspective.
 */
function FilterDropdown({
  testIdPrefix,
  label,
  options,
  selected,
  onChange,
}: {
  testIdPrefix: string;
  label: string;
  options: string[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const active = selected.length > 0;
  const summary = active
    ? selected.length === 1
      ? truncate(selected[0], 18)
      : `${selected.length} selected`
    : "All";

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const toggle = (opt: string) => {
    onChange(
      selected.includes(opt)
        ? selected.filter((s) => s !== opt)
        : [...selected, opt],
    );
  };

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        data-testid={`${testIdPrefix}-toggle`}
        aria-pressed={active}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-body text-xs font-semibold transition-[transform,background-color,color,border-color] duration-280 ease-out-quart hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ua focus-visible:ring-offset-2 focus-visible:ring-offset-navy",
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
        <span className="uppercase tracking-wider">{label}:</span>
        <span className="normal-case tracking-normal">{summary}</span>
        <ChevronDown className="h-3 w-3" strokeWidth={2.5} />
      </button>
      {open && (
        <div
          role="listbox"
          aria-multiselectable="true"
          data-testid={`${testIdPrefix}-menu`}
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
          {active && (
            <button
              type="button"
              data-testid={`${testIdPrefix}-clear`}
              onClick={() => onChange([])}
              className="mb-1 w-full rounded-sm px-2 py-1 text-left text-[color:var(--text-muted)] hover:bg-[color:var(--surface-hover)] hover:text-cloud-white"
            >
              Clear selection
            </button>
          )}
          {options.map((opt) => {
            const isOn = selected.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                role="option"
                aria-selected={isOn}
                data-testid={`${testIdPrefix}-opt-${slug(opt)}`}
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

/**
 * Single-select dropdown chip. Same shape as FilterDropdown but the
 * options are tri-state radio-style: only one active at a time, and
 * the "all" sentinel resets the filter. Used for Status where
 * Running / Paused are mutually exclusive.
 */
function SingleSelectDropdown({
  testIdPrefix,
  label,
  options,
  selected,
  onChange,
}: {
  testIdPrefix: string;
  label: string;
  options: { value: string; label: string }[];
  selected: string;
  onChange: (next: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const current = options.find((o) => o.value === selected);
  const active = selected !== "all";

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        data-testid={`${testIdPrefix}-toggle`}
        aria-pressed={active}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 font-body text-xs font-semibold transition-[transform,background-color,color,border-color] duration-280 ease-out-quart hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ua focus-visible:ring-offset-2 focus-visible:ring-offset-navy",
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
        <span className="uppercase tracking-wider">{label}:</span>
        <span className="normal-case tracking-normal">
          {current?.label ?? "All"}
        </span>
        <ChevronDown className="h-3 w-3" strokeWidth={2.5} />
      </button>
      {open && (
        <div
          role="listbox"
          data-testid={`${testIdPrefix}-menu`}
          className="absolute left-0 top-full z-30 mt-1 w-48 rounded-md p-1 font-body text-xs shadow-lg"
          style={{
            background: "var(--surface-glass-solid, var(--surface-base))",
            border: "1px solid var(--border-glass)",
          }}
        >
          {options.map((opt) => {
            const isOn = opt.value === selected;
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                aria-selected={isOn}
                data-testid={`${testIdPrefix}-opt-${opt.value}`}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full items-center justify-between rounded-sm px-2 py-1.5 text-left hover:bg-[color:var(--surface-hover)]",
                  isOn && "text-ua",
                )}
              >
                <span>{opt.label}</span>
                {isOn && <Check className="h-3 w-3 shrink-0" strokeWidth={2.5} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}
