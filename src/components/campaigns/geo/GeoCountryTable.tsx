"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import { GlassCard } from "@/components/ui/GlassCard";
import { EmptyState } from "@/components/ui/EmptyState";
import type { GeoRow } from "@/lib/globalcomix-queries";

type Props = {
  rows: GeoRow[];
};

type SortKey = "country" | "sub_paid" | "sub_organic" | "sub_d7" | "paid_pct" | "rev_d7";
type SortDir = "asc" | "desc";

const COLUMNS: Array<{ key: SortKey; label: string; align: "left" | "right" }> = [
  { key: "country", label: "Country", align: "left" },
  { key: "sub_paid", label: "Sub Paid", align: "right" },
  { key: "sub_organic", label: "Sub Organic", align: "right" },
  { key: "sub_d7", label: "Sub D7", align: "right" },
  { key: "paid_pct", label: "Paid %", align: "right" },
  { key: "rev_d7", label: "Rev D7", align: "right" },
];

/**
 * Per-country table. The Looker reference page has 12 columns covering
 * the full spend + cohort metric set; Lumen's Phase-1 cohort query
 * carries only the subscriber side (paid / organic / total / revenue),
 * so this table is honest about what BigQuery surfaces today. The
 * orchestrator surfaces an InfoCallout above the table to call out
 * the cost-side gap so an analyst doesn't read the absence as a bug.
 *
 * Layout treatment mirrors CreativeTable: GlassCard wrapper, sticky
 * header, horizontal scroll under 720px, intensity-bar background on
 * the Sub D7 column so the dominant rows are visually obvious. No
 * cell-tone tinting — without cost-side rate metrics there's no
 * "lower-better" comparison to make.
 */
export function GeoCountryTable({ rows }: Props) {
  const [sortKey, setSortKey] = useState<SortKey>("sub_d7");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const maxSubD7 = useMemo(
    () => rows.reduce((acc, r) => (r.sub_d7 > acc ? r.sub_d7 : acc), 0),
    [rows],
  );

  const sortedRows = useMemo(() => {
    const factor = sortDir === "asc" ? 1 : -1;
    const out = [...rows];
    out.sort((a, b) => {
      switch (sortKey) {
        case "country":
          return factor * a.country_name.localeCompare(b.country_name);
        case "sub_paid":
          return factor * (a.sub_paid - b.sub_paid);
        case "sub_organic":
          return factor * (a.sub_organic - b.sub_organic);
        case "sub_d7":
          return factor * (a.sub_d7 - b.sub_d7);
        case "paid_pct":
          return factor * (paidPct(a) - paidPct(b));
        case "rev_d7":
          return factor * (a.rev_d7 - b.rev_d7);
      }
    });
    return out;
  }, [rows, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      // Country defaults asc (A→Z); every numeric column defaults desc.
      setSortDir(key === "country" ? "asc" : "desc");
    }
  };

  if (rows.length === 0) {
    return (
      <GlassCard className="p-6" data-testid="geo-country-table-empty">
        <EmptyState
          title="No geographic data for this window"
          description="Widen the date range or clear OS / Channels chips to see country-level activity."
        />
      </GlassCard>
    );
  }

  return (
    <GlassCard
      className="flex flex-col gap-3 p-3"
      data-testid="geo-country-table"
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="text-left text-[11px] font-semibold uppercase tracking-wider text-[color:var(--text-muted)]">
              {COLUMNS.map((c) => (
                <SortableTh
                  key={c.key}
                  label={c.label}
                  align={c.align}
                  active={sortKey === c.key}
                  dir={sortDir}
                  onClick={() => toggleSort(c.key)}
                />
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((r) => {
              const subFillPct =
                maxSubD7 > 0
                  ? Math.max(2, Math.round((r.sub_d7 / maxSubD7) * 100))
                  : 0;
              return (
                <tr
                  key={r.country_code || r.country_name}
                  data-testid={`geo-row-${r.country_code || r.country_name}`}
                  className="border-t border-[color:var(--border-subtle)] hover:bg-[color:var(--surface-hover)]"
                >
                  <td className="whitespace-nowrap px-3 py-3">
                    <span className="flex items-center gap-2">
                      <FlagOrFallback code={r.country_code} />
                      <span className="truncate font-medium text-cloud-white">
                        {r.country_name || r.country_code}
                      </span>
                    </span>
                  </td>
                  <NumCell value={r.sub_paid} />
                  <NumCell value={r.sub_organic} />
                  <SubD7Cell value={r.sub_d7} fillPct={subFillPct} />
                  <PctCell value={paidPct(r)} />
                  <MoneyCell value={r.rev_d7} />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </GlassCard>
  );
}

// ── Cell renderers ────────────────────────────────────────────────────

function SortableTh({
  label,
  align,
  active,
  dir,
  onClick,
}: {
  label: string;
  align: "left" | "right";
  active: boolean;
  dir: SortDir;
  onClick: () => void;
}) {
  const Caret = dir === "asc" ? ChevronUp : ChevronDown;
  return (
    <th
      className={cn(
        "select-none whitespace-nowrap px-3 pb-2 pt-1",
        align === "right" ? "text-right" : "text-left",
      )}
    >
      <button
        type="button"
        onClick={onClick}
        className={cn(
          "inline-flex items-center gap-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ua focus-visible:ring-offset-2 focus-visible:ring-offset-navy",
          align === "right" ? "ml-auto" : "",
          active ? "text-ua" : "hover:text-cloud-white",
        )}
      >
        {label}
        {active && <Caret className="h-3 w-3" strokeWidth={2.5} />}
      </button>
    </th>
  );
}

function NumCell({ value }: { value: number }) {
  if (!Number.isFinite(value) || value === 0) {
    return (
      <td className="whitespace-nowrap px-3 py-3 text-right text-[color:var(--text-muted)]">
        —
      </td>
    );
  }
  return (
    <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-cloud-white">
      {Math.round(value).toLocaleString("en-US")}
    </td>
  );
}

function SubD7Cell({ value, fillPct }: { value: number; fillPct: number }) {
  return (
    <td className="relative whitespace-nowrap px-3 py-3 text-right tabular-nums text-cloud-white">
      {/* Intensity bar — same treatment as CreativeTable's Spend column.
          Anchored to the right so the bar reads as "share of the
          dominant row" rather than a tick mark. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-1 right-1 rounded-sm"
        style={{
          width: `${fillPct}%`,
          background:
            "color-mix(in oklab, var(--color-ua) 14%, transparent)",
        }}
      />
      <span className="relative">
        {Number.isFinite(value) && value > 0
          ? Math.round(value).toLocaleString("en-US")
          : "—"}
      </span>
    </td>
  );
}

function PctCell({ value }: { value: number }) {
  if (!Number.isFinite(value)) {
    return (
      <td className="whitespace-nowrap px-3 py-3 text-right text-[color:var(--text-muted)]">
        —
      </td>
    );
  }
  return (
    <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-cloud-white">
      {value.toFixed(1)}%
    </td>
  );
}

function MoneyCell({ value }: { value: number }) {
  if (!Number.isFinite(value) || value === 0) {
    return (
      <td className="whitespace-nowrap px-3 py-3 text-right text-[color:var(--text-muted)]">
        —
      </td>
    );
  }
  const formatted =
    value >= 1000
      ? `$${(value / 1000).toFixed(1)}k`
      : `$${value.toFixed(0)}`;
  return (
    <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-cloud-white">
      {formatted}
    </td>
  );
}

function FlagOrFallback({ code }: { code: string }) {
  const flag = flagEmoji(code);
  if (flag) {
    return (
      <span aria-hidden className="text-base leading-none">
        {flag}
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className="grid h-5 w-5 place-items-center rounded-sm text-[color:var(--text-muted)]"
      style={{ background: "var(--surface-hover)" }}
    >
      <Globe className="h-3 w-3" strokeWidth={2} />
    </span>
  );
}

// ── Helpers ────────────────────────────────────────────────────────

export function paidPct(r: GeoRow): number {
  const total = r.sub_d7;
  if (!Number.isFinite(total) || total === 0) return 0;
  return (r.sub_paid / total) * 100;
}

/**
 * ISO-2 → emoji flag via the regional-indicator-symbol Unicode trick.
 * Returns null for unknown / non-ISO inputs so the caller can fall
 * back to a generic Globe icon. Lower-case the code defensively.
 */
function flagEmoji(code: string): string | null {
  if (!code || code.length !== 2) return null;
  const up = code.toUpperCase();
  if (!/^[A-Z]{2}$/.test(up)) return null;
  const offset = 0x1f1e6 - "A".charCodeAt(0);
  const codePoints = [...up].map((c) => c.charCodeAt(0) + offset);
  return String.fromCodePoint(...codePoints);
}
