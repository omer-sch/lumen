"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { GlassCard } from "@/components/ui/GlassCard";
import { cn } from "@/lib/utils";
import type { LifecycleOsRow } from "@/lib/lifecycle/use-lifecycle-data";

type Props = {
  osMix: LifecycleOsRow[];
  enterIndex?: number;
  className?: string;
};

const OS_TINT: Record<string, string> = {
  iOS: "var(--color-ua)",
  Android: "var(--color-yellow)",
  Web: "var(--color-organic)",
};

const TOOLTIP_STYLE = {
  background: "rgba(10, 20, 40, 0.96)",
  backdropFilter: "blur(12px)",
  border: "1px solid var(--border-strong, rgba(255,255,255,0.18))",
  borderRadius: 10,
  color: "#FFFFFF",
  fontSize: 13,
  fontWeight: 600,
  padding: "8px 12px",
  boxShadow: "var(--shadow-elevated)",
};

/**
 * OS mix as a donut — modeled on PaidVsOrganicMix's treatment so the
 * Attribution and Lifecycle donuts feel related. Center label carries
 * the total subscriber count for the window; legend below.
 *
 * Reminder: OS here is a chart dimension, not a filter. The TopBar's OS
 * chip unmounts on Lifecycle (CLAUDE.md, Lifecycle tab) because the
 * dwh_total_subs query ignores it.
 */
export function OsMixCard({ osMix, enterIndex, className }: Props) {
  const total = osMix.reduce((acc, r) => acc + r.subs, 0);

  if (total === 0) {
    return (
      <GlassCard
        className={cn("flex flex-col gap-3 p-5", className)}
        enterIndex={enterIndex}
        data-testid="lifecycle-os-mix"
      >
        <SectionHeader />
        <p className="font-body text-sm text-[color:var(--text-muted)]">
          No OS mix for this window.
        </p>
      </GlassCard>
    );
  }

  const data = osMix.map((r) => ({
    name: r.os,
    value: r.subs,
    share: r.share,
    fill: OS_TINT[r.os] ?? "var(--text-muted)",
  }));

  return (
    <GlassCard
      glow="ua"
      enterIndex={enterIndex}
      className={cn("flex flex-col gap-3 p-5", className)}
      data-testid="lifecycle-os-mix"
    >
      <SectionHeader />

      {/* Vertical-first composition when slotted alongside NetSubTrend: the
          donut leads, legend stacks below. Falls back to side-by-side on
          very wide single-column renders so the empty space doesn't grow. */}
      <div className="flex flex-1 flex-col items-center justify-center gap-5">
        <div
          className="relative h-40 w-40 shrink-0 sm:h-44 sm:w-44"
          role="img"
          aria-label={
            "OS mix: " +
            data
              .map((d) => `${d.name} ${(d.share * 100).toFixed(0)}%`)
              .join(", ")
          }
        >
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Tooltip
                cursor={{ fill: "var(--color-ua)", fillOpacity: 0.06 }}
                contentStyle={TOOLTIP_STYLE}
                itemStyle={{ color: "#FFFFFF", fontSize: 13, fontWeight: 600, padding: 0 }}
                labelStyle={{
                  color: "#FFFFFF",
                  fontSize: 12,
                  fontWeight: 700,
                  marginBottom: 4,
                }}
                formatter={(value, name, item) => {
                  const n = typeof value === "number" ? value : Number(value);
                  const safe = Number.isFinite(n) ? n : 0;
                  const payload = (item as { payload?: { share?: number } })?.payload;
                  const share = payload?.share ?? 0;
                  return [
                    `${safe.toLocaleString()} (${(share * 100).toFixed(1)}%)`,
                    String(name),
                  ];
                }}
              />
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius="62%"
                outerRadius="92%"
                paddingAngle={2}
                stroke="var(--surface-base)"
                strokeWidth={2}
                isAnimationActive={false}
              >
                {data.map((d) => (
                  <Cell key={d.name} fill={d.fill} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-body text-[10px] uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
              Subs
            </span>
            <span className="font-display text-lg font-bold text-cloud-white tabular-nums">
              {total.toLocaleString()}
            </span>
          </div>
        </div>

        <ul className="flex w-full flex-col gap-2 font-body text-sm">
          {data.map((d) => (
            <li
              key={d.name}
              className="grid grid-cols-[10px_1fr_auto_auto] items-center gap-2.5"
              data-testid={`lifecycle-os-mix-row-${d.name.toLowerCase()}`}
            >
              <span
                aria-hidden
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: d.fill, boxShadow: `0 0 6px ${d.fill}` }}
              />
              <span className="text-[color:var(--text-secondary)]">
                {d.name}
              </span>
              <span className="tabular-nums text-cloud-white">
                {(d.share * 100).toFixed(1)}%
              </span>
              <span className="tabular-nums text-[color:var(--text-muted)]">
                {d.value.toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </GlassCard>
  );
}

function SectionHeader() {
  return (
    <header className="flex flex-col gap-0.5">
      <h2 className="font-display text-md font-bold leading-none text-cloud-white">
        OS mix
      </h2>
      <p className="font-body text-[11px] text-[color:var(--text-muted)]">
        Share of new subscribers by platform. Web users matter for lifecycle even when the dashboard is iOS-only.
      </p>
    </header>
  );
}
