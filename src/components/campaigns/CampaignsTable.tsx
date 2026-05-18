"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowDown, ArrowDownRight, ArrowUp, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { GlassCard } from "@/components/ui/GlassCard";
import { LivePulse } from "@/components/ui/LivePulse";
import { enrichCampaignRow } from "@/lib/analyst/campaign-classifier";
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
 * sort by any column, narrow to a single network / family / geo / status
 * without touching the global filter.
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
  const [network, setNetwork] = useState<NetworkFilter>("all");
  const [family, setFamily] = useState<string>("all");
  const [geo, setGeo] = useState<string>("all");
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
      if (!matchesNetwork(r.network, network)) return false;
      if (family !== "all" && r.family !== family) return false;
      if (geo !== "all" && r.geo !== geo) return false;
      if (status !== "all") {
        const s = normalizeStatus(r.campaign_status);
        if (s !== status) return false;
      }
      return true;
    });
  }, [enriched, network, family, geo, status]);

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
      <div className="flex flex-col gap-2">
        {/* Row 1: networks + the Show More toggle on the right. */}
        <div className="flex flex-wrap items-center gap-1.5">
          {NETWORK_FILTERS.map((c) => (
            <ChipButton
              key={c}
              testId={`campaigns-channel-${c}`}
              active={network === c}
              label={c === "all" ? "All networks" : c}
              onClick={() => setNetwork(c)}
            />
          ))}
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
              {showMore ? "Less" : "More"}
            </button>
          </span>
        </div>

        {/* Row 2: family. Hidden when only one family is present (the
            chip group would be a no-op). */}
        {familyOptions.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 font-body text-[10px] font-semibold uppercase tracking-wider text-[color:var(--text-muted)]">
              Family
            </span>
            <ChipButton
              testId="campaigns-family-all"
              active={family === "all"}
              label="All"
              onClick={() => setFamily("all")}
            />
            {familyOptions.map((f) => (
              <ChipButton
                key={f}
                testId={`campaigns-family-${slug(f)}`}
                active={family === f}
                label={f}
                onClick={() => setFamily(f)}
              />
            ))}
          </div>
        )}

        {/* Row 3: geo. Same hide-when-degenerate guard. */}
        {geoOptions.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 font-body text-[10px] font-semibold uppercase tracking-wider text-[color:var(--text-muted)]">
              Geo
            </span>
            <ChipButton
              testId="campaigns-geo-all"
              active={geo === "all"}
              label="All"
              onClick={() => setGeo("all")}
            />
            {geoOptions.map((g) => (
              <ChipButton
                key={g}
                testId={`campaigns-geo-${slug(g)}`}
                active={geo === g}
                label={g}
                onClick={() => setGeo(g)}
              />
            ))}
          </div>
        )}

        {/* Row 4: status. Always render — the column is dichotomous so
            "All / Running / Paused" is always a meaningful split. */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 font-body text-[10px] font-semibold uppercase tracking-wider text-[color:var(--text-muted)]">
            Status
          </span>
          {STATUS_FILTERS.map((s) => (
            <ChipButton
              key={s}
              testId={`campaigns-status-${s}`}
              active={status === s}
              label={s === "all" ? "All" : s === "running" ? "Running" : "Paused"}
              onClick={() => setStatus(s)}
            />
          ))}
        </div>
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
