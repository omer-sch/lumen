"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { GlassCard } from "@/components/ui/GlassCard";
import type { ProfileCreativeRow } from "@/types/dashboard";

type SortKey = "ad_name" | "network" | "sub_d7" | "roi_d7";
type SortDir = "asc" | "desc";

const COLUMNS: { key: SortKey; label: string; align: "left" | "right" }[] = [
  { key: "ad_name", label: "Creative", align: "left" },
  { key: "network", label: "Network",  align: "right" },
  { key: "sub_d7",  label: "Sub D7",   align: "right" },
  { key: "roi_d7",  label: "ROI D7",   align: "right" },
];

/**
 * Per-ad cohort slice within one campaign. Thumbnail from Meta's
 * `ods_fb2_creatives_globalcomix` when present; other networks render
 * with a neutral placeholder. Per-ad spend isn't joined yet (spend
 * side fans rows differently on the creative slice); CPI / CPA D7
 * surface as "—" until that join lands.
 */
export function CreativeBreakdown({
  creatives,
}: {
  creatives: ProfileCreativeRow[];
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: "sub_d7",
    dir: "desc",
  });

  const sorted = useMemo(() => {
    const out = [...creatives];
    out.sort((a, b) => {
      const va = sortValue(a, sort.key);
      const vb = sortValue(b, sort.key);
      if (typeof va === "number" && typeof vb === "number") {
        return sort.dir === "asc" ? va - vb : vb - va;
      }
      return sort.dir === "asc"
        ? String(va).localeCompare(String(vb))
        : String(vb).localeCompare(String(va));
    });
    return out;
  }, [creatives, sort]);

  const toggle = (key: SortKey) => {
    setSort((cur) =>
      cur.key === key
        ? { key, dir: cur.dir === "asc" ? "desc" : "asc" }
        : { key, dir: key === "ad_name" || key === "network" ? "asc" : "desc" },
    );
  };

  return (
    <GlassCard className="flex flex-col gap-4 p-6" data-testid="profile-creatives">
      <div>
        <h3 className="font-display text-md font-bold leading-none text-cloud-white">
          Creatives
        </h3>
        <p className="mt-1 font-body text-xs text-[color:var(--text-muted)]">
          Per-ad cohort metrics. Meta thumbnails when available; Google /
          Apple / AppLovin have no ad-level data today.
        </p>
      </div>
      {sorted.length === 0 ? (
        <p className="font-body text-sm text-[color:var(--text-muted)]">
          No creative-level attribution in the active window.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="profile-creatives-table">
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
                        data-testid={`profile-creatives-sort-${c.key}`}
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
                  key={row.ad_id}
                  data-testid={`creative-row-${row.ad_id}`}
                  className="border-t border-[color:var(--border-subtle)] hover:bg-[color:var(--surface-hover)]"
                >
                  <td className="whitespace-nowrap px-3 py-3">
                    <div className="flex items-center gap-3">
                      {row.thumbnail_url ? (
                        <Image
                          src={row.thumbnail_url}
                          alt=""
                          width={36}
                          height={36}
                          className="h-9 w-9 rounded-md object-cover"
                          unoptimized
                        />
                      ) : (
                        <span
                          aria-hidden
                          className="grid h-9 w-9 shrink-0 place-items-center rounded-md font-display text-[10px] font-extrabold text-[color:var(--text-muted)]"
                          style={{ background: "var(--surface-hover)" }}
                        >
                          {row.network ? row.network.slice(0, 2).toUpperCase() : "AD"}
                        </span>
                      )}
                      <span className="truncate font-medium text-cloud-white">
                        {row.ad_name || row.ad_id}
                      </span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right text-[color:var(--text-secondary)]">
                    {row.network || "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-cloud-white">
                    {row.sub_d7 > 0 ? row.sub_d7.toLocaleString() : "—"}
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

function sortValue(row: ProfileCreativeRow, key: SortKey): string | number {
  switch (key) {
    case "ad_name": return row.ad_name || row.ad_id;
    case "network": return row.network;
    case "sub_d7":  return row.sub_d7;
    case "roi_d7":  return row.roi_d7;
  }
}
