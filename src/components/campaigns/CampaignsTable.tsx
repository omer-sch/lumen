"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowDown, ArrowDownRight, ArrowUp, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { GlassCard } from "@/components/ui/GlassCard";
import type { CampaignRow } from "@/types/dashboard";

type SortKey =
  | "campaign_name"
  | "network"
  | "spend"
  | "installs"
  | "cpi"
  | "cpa_d7"
  | "roi_d7"
  | "spendDelta";

type SortDir = "asc" | "desc";

type ColumnDef = {
  key: SortKey;
  label: string;
  align: "left" | "right";
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
];

/**
 * Network → on-row chip colors. Real-data networks come back as
 * free-form strings — anything that doesn't match a known label gets
 * the neutral fallback so a new network appearing in the warehouse
 * doesn't crash the renderer.
 */
function networkStyle(n: string): { bg: string; fg: string } {
  const map: Record<string, { bg: string; fg: string }> = {
    Meta:           { bg: "var(--tint-ua-soft)",       fg: "var(--color-ua)" },
    Facebook:       { bg: "var(--tint-ua-soft)",       fg: "var(--color-ua)" },
    TikTok:         { bg: "var(--tint-creative-soft)", fg: "var(--color-creative)" },
    "Google Ads":   { bg: "var(--tint-yellow-soft)",   fg: "var(--color-yellow)" },
    Google:         { bg: "var(--tint-yellow-soft)",   fg: "var(--color-yellow)" },
    Apple:          { bg: "var(--tint-organic-soft)",  fg: "var(--color-organic)" },
    "Apple Search Ads": { bg: "var(--tint-organic-soft)", fg: "var(--color-organic)" },
    AppLovin:       { bg: "var(--tint-creative-soft)", fg: "var(--color-creative)" },
  };
  return (
    map[n] ?? {
      bg: "var(--surface-hover)",
      fg: "var(--text-secondary)",
    }
  );
}

const NETWORK_FILTERS = ["all", "Meta", "TikTok", "Google", "Apple", "AppLovin"] as const;

type NetworkFilter = (typeof NETWORK_FILTERS)[number];

const matchesNetwork = (rowNetwork: string, f: NetworkFilter): boolean => {
  if (f === "all") return true;
  const n = rowNetwork.toLowerCase();
  switch (f) {
    case "Meta":     return n === "meta" || n === "facebook";
    case "Google":   return n.startsWith("google");
    case "Apple":    return n.startsWith("apple");
    case "TikTok":   return n.includes("tiktok");
    case "AppLovin": return n.includes("applovin");
  }
};

const fmtMoney = (n: number) =>
  `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

const fmtCount = (n: number) => n.toLocaleString();

const fmtCpi = (n: number) => `$${n.toFixed(2)}`;

const fmtRoi = (n: number) => `${n.toFixed(2)}x`;

const fmtDeltaPct = (frac: number | null): string => {
  if (frac == null) return "—";
  return `${(frac * 100).toFixed(1)}%`;
};

type CampaignsTableProps = {
  rows: CampaignRow[];
};

/**
 * Index table. Columns map 1:1 to `CampaignRow` from the BQ wire shape;
 * sort by any column, narrow to a single network without touching the
 * global filter.
 *
 * CPA D7 / Sub D7 fields are optional on `CampaignRow` (gaming-vocab
 * clients don't populate them); their cells print "—" rather than a
 * misleading zero.
 */
export function CampaignsTable({ rows }: CampaignsTableProps) {
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: "spend",
    dir: "desc",
  });
  const [network, setNetwork] = useState<NetworkFilter>("all");

  // Carry the global filter into the deep-link so the campaign profile
  // opens with the same window + client the user is browsing.
  const params = useSearchParams();
  const profileQuery = params.toString();

  const filtered = useMemo(
    () => rows.filter((r) => matchesNetwork(r.network, network)),
    [rows, network],
  );

  const sorted = useMemo(() => {
    const out = [...filtered];
    out.sort((a, b) => {
      const va = sortValue(a, sort.key);
      const vb = sortValue(b, sort.key);
      // Nulls always sort last regardless of direction so unmatured
      // cohort rows don't cluster at the top under desc.
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

  return (
    <GlassCard glow="ua" enterIndex={1} className="flex flex-col gap-5 p-5">
      <div className="flex flex-wrap items-center gap-1.5">
        {NETWORK_FILTERS.map((c) => {
          const active = network === c;
          return (
            <button
              key={c}
              type="button"
              data-testid={`campaigns-channel-${c}`}
              onClick={() => setNetwork(c)}
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
              {c === "all" ? "All networks" : c}
            </button>
          );
        })}
        <span className="ml-auto text-[11px] uppercase tracking-wider text-[color:var(--text-muted)]">
          {sorted.length} campaigns
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm" data-testid="campaigns-table">
          <thead>
            <tr className="text-[11px] font-semibold uppercase tracking-wider text-[color:var(--text-muted)]">
              {COLUMNS.map((c) => {
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
              const ch = networkStyle(row.network);
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
              return (
                <tr
                  key={row.campaign_id}
                  data-testid={`campaign-row-${row.campaign_id}`}
                  className="group border-t border-[color:var(--border-subtle)] transition-colors duration-280 ease-out-quart hover:bg-[color:var(--surface-hover)]"
                >
                  <td className="whitespace-nowrap px-3 py-3">
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
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                      style={{ background: ch.bg, color: ch.fg }}
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
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td
                  colSpan={COLUMNS.length}
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

function sortValue(row: CampaignRow, key: SortKey): string | number | null {
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
  }
}
