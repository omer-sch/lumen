"use client";

import { GlassCard } from "@/components/ui/GlassCard";
import { formatKpi } from "@/lib/format";
import type { NetworkRow } from "@/types/dashboard";

type Props = {
  rows: NetworkRow[];
  /** Stagger position in the page (1-based). */
  enterIndex?: number;
};

/**
 * Per-network performance table. Each row is one network the client is
 * actively spending on; columns cover spend / share / volume / efficiency /
 * payback. ROAS D7 → ROAS D30 are shown side by side so the analyst can
 * see how the cohort matures.
 *
 * Replaces the old single-metric ChannelMix bar list. ChannelMix is
 * still used for clients that don't populate the extended dwh metrics
 * (Playw3, 100play), this is the multi-source variant.
 */
export function NetworkBreakdown({ rows, enterIndex }: Props) {
  if (rows.length === 0) return null;

  return (
    <GlassCard
      glow="ua"
      feature
      enterIndex={enterIndex}
      className="flex flex-col gap-3 p-4"
      data-testid="network-breakdown"
    >
      <div>
        <h2 className="font-display text-md font-bold leading-none text-cloud-white">
          Network performance
        </h2>
        <p className="mt-1 font-body text-xs text-[color:var(--text-muted)]">
          Spend, volume, efficiency, and cohort payback per source.
        </p>
      </div>

      <div className="-mx-1 overflow-x-auto">
        <table
          className="w-full min-w-[1100px] table-auto border-separate font-body text-sm"
          style={{ borderSpacing: 0 }}
        >
          <thead>
            <tr className="text-[10px] font-semibold uppercase tracking-wider text-[color:var(--text-muted)]">
              <Th align="left">Network</Th>
              <Th align="right">Spend</Th>
              <Th align="right">Installs</Th>
              <Th align="right">Clicks</Th>
              <Th align="right">Impr.</Th>
              <Th align="right">CPI</Th>
              <Th align="right">CTR</Th>
              <Th align="right">CPM</Th>
              <Th align="right">CPC</Th>
              <Th align="right">ROAS D7</Th>
              <Th align="right">ROAS D14</Th>
              <Th align="right">ROAS D30</Th>
              <Th align="right">ROAS D90</Th>
              <Th align="right">Ret. D7</Th>
              <Th align="right">Payers D7</Th>
              <Th align="right">FTD D7</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={r.network}
                data-testid={`network-row-${r.network}`}
                className="transition-colors duration-200 hover:bg-[color:var(--surface-hover)]"
              >
                <Td align="left">
                  <div className="flex flex-col gap-0.5">
                    <span className="font-semibold text-cloud-white">
                      {r.network}
                    </span>
                    <SpendShareBar share={r.share} isTop={i === 0} />
                  </div>
                </Td>
                <Td align="right" mono>
                  {formatKpi.money(r.spend)}
                  <span className="ml-2 text-[10px] text-[color:var(--text-muted)]">
                    {(r.share * 100).toFixed(0)}%
                  </span>
                </Td>
                <Td align="right" mono>{formatKpi.count(r.installs)}</Td>
                <Td align="right" mono>{formatKpi.count(r.clicks)}</Td>
                <Td align="right" mono>{formatKpi.count(r.impressions)}</Td>
                <Td align="right" mono>{formatKpi.cpi(r.cpi)}</Td>
                <Td align="right" mono>{formatKpi.percent(r.ctr)}</Td>
                <Td align="right" mono>{formatKpi.moneyCents(r.cpm)}</Td>
                <Td align="right" mono>{formatKpi.moneyCents(r.cpc)}</Td>
                <Td align="right" mono highlight={r.roasD7 >= 1}>
                  {formatKpi.ratio(r.roasD7)}
                </Td>
                <Td align="right" mono highlight={r.roasD14 >= 1}>
                  {formatKpi.ratio(r.roasD14)}
                </Td>
                <Td align="right" mono highlight={r.roasD30 >= 1}>
                  {formatKpi.ratio(r.roasD30)}
                </Td>
                <Td align="right" mono highlight={r.roasD90 >= 1}>
                  {formatKpi.ratio(r.roasD90)}
                </Td>
                <Td align="right" mono>{formatKpi.percent(r.retD7)}</Td>
                <Td align="right" mono>{formatKpi.count(r.payersD7)}</Td>
                <Td align="right" mono>{formatKpi.count(r.ftdD7)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </GlassCard>
  );
}

function Th({
  children,
  align,
}: {
  children: React.ReactNode;
  align: "left" | "right";
}) {
  return (
    <th
      className={`px-2 pb-2 ${align === "right" ? "text-right" : "text-left"}`}
      style={{ borderBottom: "1px solid var(--border-subtle)" }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align,
  mono,
  highlight,
}: {
  children: React.ReactNode;
  align: "left" | "right";
  mono?: boolean;
  /** Apply mint accent — used when a value crosses a meaningful threshold
   *  (e.g. ROAS reaches 1.0x and the network is profitable on its own). */
  highlight?: boolean;
}) {
  return (
    <td
      className={`px-2 py-2.5 ${align === "right" ? "text-right" : "text-left"} ${
        mono ? "tabular-nums" : ""
      }`}
      style={{
        color: highlight ? "var(--color-ua)" : "var(--text-primary)",
        fontWeight: highlight ? 600 : undefined,
        borderBottom: "1px solid var(--border-subtle)",
      }}
    >
      {children}
    </td>
  );
}

/**
 * Inline progress bar under the network name showing relative spend share.
 * Mint for the leading network, muted UA for the rest — same accent
 * vocabulary as the old ChannelMix component so the visual language
 * stays consistent.
 */
function SpendShareBar({ share, isTop }: { share: number; isTop: boolean }) {
  const pct = Math.min(Math.max(share, 0), 1) * 100;
  return (
    <div
      className="relative h-1 w-32 overflow-hidden rounded-full"
      style={{ background: "var(--surface-track)" }}
    >
      <div
        className="absolute inset-y-0 left-0 rounded-full"
        style={{
          width: `${pct}%`,
          background: isTop
            ? "linear-gradient(90deg, var(--color-ua), var(--color-ua-glow))"
            : "var(--color-ua)",
          boxShadow: isTop
            ? "0 0 8px color-mix(in oklab, var(--color-ua-glow) 60%, transparent)"
            : undefined,
        }}
      />
    </div>
  );
}
