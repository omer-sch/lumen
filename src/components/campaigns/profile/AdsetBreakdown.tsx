"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { GlassCard } from "@/components/ui/GlassCard";
import type { AdsetRow } from "@/types/dashboard";

type SortKey = "adset_name" | "network" | "sub_d7" | "roi_d7";
type SortDir = "asc" | "desc";

const COLUMNS: { key: SortKey; label: string; align: "left" | "right" }[] = [
  { key: "adset_name", label: "Adset",   align: "left" },
  { key: "network",    label: "Network", align: "right" },
  { key: "sub_d7",     label: "Sub D7",  align: "right" },
  { key: "roi_d7",     label: "ROI D7",  align: "right" },
];

/**
 * Per-adset rollup inside one campaign. Reads from the cohort table's
 * `_Adgroup_Attribution` column — per-adset spend isn't joined yet so
 * CPI / CPA D7 are intentionally not surfaced (would always read "—"
 * given the underlying zeros). When the breakdown_value Country slice
 * join lands later, this table widens to mirror the index columns.
 */
export function AdsetBreakdown({ adsets }: { adsets: AdsetRow[] }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: "sub_d7",
    dir: "desc",
  });

  const sorted = useMemo(() => {
    const out = [...adsets];
    out.sort((a, b) => {
      const va = sortValue(a, sort.key);
      const vb = sortValue(b, sort.key);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "number" && typeof vb === "number") {
        return sort.dir === "asc" ? va - vb : vb - va;
      }
      return sort.dir === "asc"
        ? String(va).localeCompare(String(vb))
        : String(vb).localeCompare(String(va));
    });
    return out;
  }, [adsets, sort]);

  const toggle = (key: SortKey) => {
    setSort((cur) =>
      cur.key === key
        ? { key, dir: cur.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "adset_name" || key === "network" ? "asc" : "desc" },
    );
  };

  return (
    <GlassCard className="flex flex-col gap-4 p-6" data-testid="profile-adsets">
      <div>
        <h3 className="font-display text-md font-bold leading-none text-cloud-white">
          Adsets
        </h3>
        <p className="mt-1 font-body text-xs text-[color:var(--text-muted)]">
          Per-adset cohort split for this campaign. Adset names come from
          Adjust&apos;s _Adgroup_Attribution column.
        </p>
      </div>
      {sorted.length === 0 ? (
        <p className="font-body text-sm text-[color:var(--text-muted)]">
          No adset attribution in the active window.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="profile-adsets-table">
            <thead>
              <tr className="text-[11px] font-semibold uppercase tracking-wider text-[color:var(--text-muted)]">
                {COLUMNS.map((c) => {
                  const isActive = sort.key === c.key;
                  return (
                    <th
                      key={c.key}
                      className={cn(
                        "select-none whitespace-nowrap px-3 pb-2 pt-1",
                        c.align === "right" ? "text-right" : "text-left",
                      )}
                    >
                      <button
                        type="button"
                        data-testid={`profile-adsets-sort-${c.key}`}
                        onClick={() => toggle(c.key)}
                        className={cn(
                          "inline-flex items-center gap-1 transition-colors duration-280 ease-out-quart hover:text-cloud-white",
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
              {sorted.map((row) => (
                <tr
                  key={`${row.adset_name}-${row.network}`}
                  data-testid={`adset-row-${slug(row.adset_name)}`}
                  className="border-t border-[color:var(--border-subtle)] hover:bg-[color:var(--surface-hover)]"
                >
                  <td className="whitespace-nowrap px-3 py-3 font-medium text-cloud-white">
                    {row.adset_name}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right text-[color:var(--text-secondary)]">
                    {row.network || "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-cloud-white">
                    {row.sub_d7 != null ? row.sub_d7.toLocaleString() : "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-cloud-white">
                    {row.roi_d7 > 0 ? `${row.roi_d7.toFixed(2)}x` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </GlassCard>
  );
}

function sortValue(row: AdsetRow, key: SortKey): string | number | null {
  switch (key) {
    case "adset_name": return row.adset_name;
    case "network":    return row.network;
    case "sub_d7":     return row.sub_d7 ?? null;
    case "roi_d7":     return row.roi_d7;
  }
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
