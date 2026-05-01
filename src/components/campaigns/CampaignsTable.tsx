"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowDownRight, ArrowUp, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { GlassCard } from "@/components/ui/GlassCard";
import { RowSparkline } from "./RowSparkline";
import type { CampaignRow } from "@/lib/mock/campaigns";
import type { Channel } from "@/lib/mock/dashboard";

type SortKey =
  | "name"
  | "channel"
  | "spend"
  | "installs"
  | "cpi"
  | "roas"
  | "deltaRoas";

type SortDir = "asc" | "desc";

const COLUMNS: {
  key: SortKey | "spark";
  label: string;
  align?: "left" | "right";
  format?: (n: number) => string;
}[] = [
  { key: "name",       label: "Campaign", align: "left" },
  { key: "channel",    label: "Channel",  align: "left" },
  { key: "spend",      label: "Spend",    align: "right", format: (n) => `$${n.toLocaleString()}` },
  { key: "installs",   label: "Installs", align: "right", format: (n) => n.toLocaleString() },
  { key: "cpi",        label: "CPI",      align: "right", format: (n) => `$${n.toFixed(2)}` },
  { key: "roas",       label: "ROAS",     align: "right", format: (n) => `${n.toFixed(2)}x` },
  { key: "deltaRoas",  label: "Δ ROAS",   align: "right" },
  { key: "spark",      label: "7d trend", align: "right" },
];

const CHANNEL_FILTERS: ("all" | Channel)[] = [
  "all",
  "Meta",
  "TikTok",
  "Google",
  "AppsFlyer",
];

const channelStyle = (c: Channel) => {
  // Mint is the UA brand accent — use it for the dominant share, but tag
  // each row with a stable per-channel hue so the table still scans by
  // source at a glance. All within UA family + the legacy team palette.
  const map: Record<Channel, { bg: string; fg: string }> = {
    Meta:      { bg: "var(--tint-ua-soft)",       fg: "var(--color-ua)" },
    TikTok:    { bg: "var(--tint-creative-soft)", fg: "var(--color-creative)" },
    Google:    { bg: "var(--tint-yellow-soft)",   fg: "var(--color-yellow)" },
    AppsFlyer: { bg: "var(--tint-organic-soft)",  fg: "var(--color-organic)" },
  };
  return map[c];
};

type CampaignsTableProps = {
  rows: CampaignRow[];
};

export function CampaignsTable({ rows }: CampaignsTableProps) {
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: "spend",
    dir: "desc",
  });
  const [channel, setChannel] = useState<"all" | Channel>("all");

  const filtered = useMemo(
    () => (channel === "all" ? rows : rows.filter((r) => r.channel === channel)),
    [rows, channel],
  );

  const sorted = useMemo(() => {
    const out = [...filtered];
    out.sort((a, b) => {
      const va = a[sort.key];
      const vb = b[sort.key];
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
        : { key, dir: key === "name" || key === "channel" ? "asc" : "desc" },
    );
  };

  return (
    <GlassCard glow="ua" enterIndex={1} className="flex flex-col gap-5 p-5">
      {/* On-page channel filter — narrows the view without touching the
          global filter. Mirrors the per-page detail controls Looker users
          rely on every day. */}
      <div className="flex flex-wrap items-center gap-1.5">
        {CHANNEL_FILTERS.map((c) => {
          const active = channel === c;
          return (
            <button
              key={c}
              type="button"
              data-testid={`campaigns-channel-${c}`}
              onClick={() => setChannel(c)}
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
              {c === "all" ? "All channels" : c}
            </button>
          );
        })}
        <span className="ml-auto text-[11px] uppercase tracking-wider text-[color:var(--text-muted)]">
          {sorted.length} campaigns
        </span>
      </div>

      {/* Scrollable on narrow viewports — Looker tables wrap, ours doesn't. */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm" data-testid="campaigns-table">
          <thead>
            <tr className="text-[11px] font-semibold uppercase tracking-wider text-[color:var(--text-muted)]">
              {COLUMNS.map((c) => {
                const isSortable = c.key !== "spark";
                const isActive = sort.key === (c.key as SortKey);
                return (
                  <th
                    key={c.key}
                    scope="col"
                    className={cn(
                      "select-none whitespace-nowrap px-3 pb-2 pt-1",
                      c.align === "right" ? "text-right" : "text-left",
                    )}
                  >
                    {isSortable ? (
                      <button
                        type="button"
                        data-testid={`sort-${c.key}`}
                        onClick={() => toggleSort(c.key as SortKey)}
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
                    ) : (
                      <span>{c.label}</span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => {
              const ch = channelStyle(row.channel);
              const roasTone =
                row.deltaRoas > 0 ? "good" : row.deltaRoas < 0 ? "bad" : "neutral";
              const RoasArrow = row.deltaRoas >= 0 ? ArrowUpRight : ArrowDownRight;
              return (
                <tr
                  key={row.id}
                  className="border-t border-[color:var(--border-subtle)] transition-colors duration-280 ease-out-quart hover:bg-[color:var(--surface-hover)]"
                >
                  <td className="whitespace-nowrap px-3 py-3">
                    <span
                      className={cn(
                        "font-medium",
                        i === 0 ? "text-ua" : "text-cloud-white",
                      )}
                    >
                      {row.name}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3">
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider"
                      style={{ background: ch.bg, color: ch.fg }}
                    >
                      {row.channel}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-[color:var(--text-secondary)]">
                    ${row.spend.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-[color:var(--text-secondary)]">
                    {row.installs.toLocaleString()}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-[color:var(--text-secondary)]">
                    ${row.cpi.toFixed(2)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums text-cloud-white">
                    {row.roas.toFixed(2)}x
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right">
                    <span
                      className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums"
                      style={{
                        background:
                          roasTone === "good"
                            ? "var(--tint-success-soft)"
                            : roasTone === "bad"
                              ? "var(--tint-danger-soft)"
                              : "var(--surface-hover)",
                        color:
                          roasTone === "good"
                            ? "var(--color-ua)"
                            : roasTone === "bad"
                              ? "var(--color-creative)"
                              : "var(--text-muted)",
                      }}
                    >
                      <RoasArrow className="h-3 w-3" strokeWidth={2.5} />
                      {Math.abs(row.deltaRoas).toFixed(1)}%
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-3 text-right">
                    <div className="ml-auto inline-block">
                      <RowSparkline
                        data={row.sparkline}
                        tone={
                          row.deltaSpend > 0
                            ? "good"
                            : row.deltaSpend < 0
                              ? "bad"
                              : "neutral"
                        }
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </GlassCard>
  );
}
