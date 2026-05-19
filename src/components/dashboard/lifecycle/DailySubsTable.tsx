"use client";

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";

import { GlassCard } from "@/components/ui/GlassCard";
import { cn } from "@/lib/utils";
import type { LifecycleDailyRow } from "@/lib/lifecycle/use-lifecycle-data";

type Props = {
  daily: LifecycleDailyRow[];
  enterIndex?: number;
  className?: string;
};

type SortKey = "date" | "subs" | "churn" | "netSub";
type SortDir = "asc" | "desc";

type RolledRow = { date: string; subs: number; churn: number; netSub: number };

/** When the active window is longer than this, we render the last
 *  MAX_VISIBLE rows and append a helper line so the page doesn't
 *  scroll forever. Threshold matches the prompt's WS1.D guidance. */
const MAX_VISIBLE = 31;

function parseIsoLocal(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function fmtDateLong(iso: string): string {
  const d = parseIsoLocal(iso);
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

const fmtCount = (n: number) => Math.round(n).toLocaleString();

/**
 * Daily subscribers / cancellations / net sub table — the detail layer
 * under the trend. Sortable on every column; defaults to Date DESC
 * (newest first, the analyst's "what happened most recently" read).
 * Treatment follows NetworkBreakdown: striped rows, sticky header,
 * hover row tint, chevron indicators on the active sort column.
 */
export function DailySubsTable({ daily, enterIndex, className }: Props) {
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: "date",
    dir: "desc",
  });

  // Roll multi-OS rows up so the table has exactly one entry per date.
  // dwh_total_subs returns one row per (date, os); the table shows the
  // cross-OS total since the OS split lives in its own card.
  const rolled = useMemo<RolledRow[]>(() => {
    const map = new Map<string, RolledRow>();
    for (const r of daily) {
      const cur = map.get(r.date) ?? {
        date: r.date,
        subs: 0,
        churn: 0,
        netSub: 0,
      };
      cur.subs += r.subs;
      cur.churn += r.churn;
      cur.netSub += r.netSub;
      map.set(r.date, cur);
    }
    return [...map.values()];
  }, [daily]);

  const sorted = useMemo(() => {
    const out = [...rolled];
    out.sort((a, b) => {
      if (sort.key === "date") {
        const cmp = a.date.localeCompare(b.date);
        return sort.dir === "asc" ? cmp : -cmp;
      }
      const av = a[sort.key];
      const bv = b[sort.key];
      return sort.dir === "asc" ? av - bv : bv - av;
    });
    return out;
  }, [rolled, sort]);

  const visible = sorted.slice(0, MAX_VISIBLE);
  const truncated = sorted.length > MAX_VISIBLE;

  const toggleSort = (key: SortKey) => {
    setSort((cur) =>
      cur.key === key
        ? { key, dir: cur.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "date" ? "desc" : "desc" },
    );
  };

  if (rolled.length === 0) {
    return (
      <GlassCard
        className={cn("flex flex-col gap-3 p-5", className)}
        enterIndex={enterIndex}
        data-testid="lifecycle-daily-table"
      >
        <SectionHeader />
        <p className="font-body text-sm text-[color:var(--text-muted)]">
          No daily detail for this window.
        </p>
      </GlassCard>
    );
  }

  return (
    <GlassCard
      glow="ua"
      enterIndex={enterIndex}
      className={cn("flex flex-col gap-3 p-5", className)}
      data-testid="lifecycle-daily-table"
    >
      <SectionHeader rowCount={rolled.length} />

      <div className="-mx-2 overflow-x-auto">
        <table className="min-w-full border-collapse font-body text-sm">
          <thead className="sticky top-0 z-10">
            <tr
              className="text-left text-[color:var(--text-muted)]"
              style={{ background: "color-mix(in oklab, var(--surface-base) 92%, transparent)" }}
            >
              <SortableHeader
                label="Date"
                colKey="date"
                sort={sort}
                onClick={toggleSort}
                align="left"
              />
              <SortableHeader
                label="New subs"
                colKey="subs"
                sort={sort}
                onClick={toggleSort}
                align="right"
              />
              <SortableHeader
                label="Cancellations"
                colKey="churn"
                sort={sort}
                onClick={toggleSort}
                align="right"
              />
              <SortableHeader
                label="Net Sub"
                colKey="netSub"
                sort={sort}
                onClick={toggleSort}
                align="right"
              />
            </tr>
          </thead>
          <tbody>
            {visible.map((row, idx) => (
              <tr
                key={row.date}
                data-testid={`lifecycle-daily-row-${row.date}`}
                className={cn(
                  "transition-colors duration-200 ease-out hover:bg-[color:var(--surface-hover)]",
                )}
                style={
                  idx % 2 === 0
                    ? undefined
                    : { background: "color-mix(in oklab, var(--surface-input) 50%, transparent)" }
                }
              >
                <td className="px-2 py-1.5 text-[color:var(--text-primary)]">
                  {fmtDateLong(row.date)}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-[color:var(--text-primary)]">
                  {fmtCount(row.subs)}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-[color:var(--text-secondary)]">
                  {fmtCount(row.churn)}
                </td>
                <td
                  className="px-2 py-1.5 text-right tabular-nums font-semibold"
                  style={{
                    color:
                      row.netSub > 0
                        ? "var(--color-ua)"
                        : row.netSub < 0
                          ? "var(--color-creative)"
                          : "var(--text-secondary)",
                  }}
                >
                  {row.netSub > 0 ? "+" : ""}
                  {fmtCount(row.netSub)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {truncated && (
        <p
          className="font-body text-[11px] italic text-[color:var(--text-muted)]"
          data-testid="lifecycle-daily-truncated"
        >
          Showing {MAX_VISIBLE} of {rolled.length} days. Narrow the date range to
          see the full window in detail.
        </p>
      )}
    </GlassCard>
  );
}

function SortableHeader({
  label,
  colKey,
  sort,
  onClick,
  align,
}: {
  label: string;
  colKey: SortKey;
  sort: { key: SortKey; dir: SortDir };
  onClick: (k: SortKey) => void;
  align: "left" | "right";
}) {
  const isActive = sort.key === colKey;
  return (
    <th
      scope="col"
      className={cn(
        "px-2 py-2 font-body text-[11px] font-semibold uppercase tracking-wider",
        align === "right" ? "text-right" : "text-left",
      )}
    >
      <button
        type="button"
        data-testid={`lifecycle-daily-sort-${colKey}`}
        aria-sort={isActive ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
        onClick={() => onClick(colKey)}
        className={cn(
          "inline-flex items-center gap-1 rounded-sm px-1 py-0.5 transition-colors duration-200 hover:text-cloud-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ua focus-visible:ring-offset-2 focus-visible:ring-offset-navy",
          isActive ? "text-cloud-white" : "text-[color:var(--text-muted)]",
        )}
      >
        {label}
        <ChevronDown
          className={cn(
            "h-3 w-3 transition-transform duration-200",
            isActive && sort.dir === "asc" && "rotate-180",
            !isActive && "opacity-40",
          )}
          strokeWidth={2.25}
        />
      </button>
    </th>
  );
}

function SectionHeader({ rowCount }: { rowCount?: number }) {
  return (
    <header className="flex flex-col gap-0.5">
      <h2 className="font-display text-md font-bold leading-none text-cloud-white">
        Daily detail
      </h2>
      <p className="font-body text-[11px] text-[color:var(--text-muted)]">
        {rowCount == null
          ? "Per-day breakdown of new subscribers, cancellations, and net change."
          : `${rowCount} ${rowCount === 1 ? "day" : "days"} in the active window. Sort by any column.`}
      </p>
    </header>
  );
}
