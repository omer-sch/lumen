"use client";

import { useEffect, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

import { GlassCard } from "@/components/ui/GlassCard";
import { cn } from "@/lib/utils";

type Props = {
  data: {
    subTotal: number;
    paid: number;
    organic: number;
  };
  enterIndex?: number;
  className?: string;
};

const fmtCount = (n: number) => Math.round(n).toLocaleString();

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
 * Paid vs Organic — donut card. Donut on the left as the visual lead,
 * three stacked stat rows on the right (Sub Total / Sub Paid / Sub
 * Organic) and a one-line caption about the organic halo at the
 * bottom.
 *
 * Mint = paid (the dashboard's UA team color is mint, paid is what UA
 * controls). Violet = organic (`--color-organic`, the brand token for
 * the Organic team). The center hole carries the total.
 */
export function PaidVsOrganicCard({ data, enterIndex, className }: Props) {
  const total = data.paid + data.organic;
  const paidPct = total > 0 ? data.paid / total : 0;
  const organicPct = total > 0 ? data.organic / total : 0;

  // Bars + slice grow on mount so the page reads as alive — same easing
  // as ChannelMix to keep motion language consistent.
  const [animated, setAnimated] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setAnimated(true);
      return;
    }
    const t = window.setTimeout(() => setAnimated(true), 80);
    return () => window.clearTimeout(t);
  }, []);

  const pieData = [
    {
      name: "Paid",
      value: data.paid,
      pct: paidPct,
      fill: "var(--color-ua)",
    },
    {
      name: "Organic",
      value: data.organic,
      pct: organicPct,
      fill: "var(--color-organic)",
    },
  ];

  const hasData = total > 0;

  return (
    <GlassCard
      glow="ua"
      enterIndex={enterIndex}
      className={cn("flex flex-col gap-5 p-6", className)}
      data-testid="attribution-paid-vs-organic"
    >
      <header className="flex flex-col gap-0.5">
        <h2 className="font-display text-md font-bold leading-none text-cloud-white">
          Paid vs Organic
        </h2>
        <p className="font-body text-[11px] text-[color:var(--text-muted)]">
          Cohort-attributed subscribers in the active window — split by acquisition source.
        </p>
      </header>

      <div className="grid grid-cols-1 items-center gap-6 md:grid-cols-[auto_1fr] md:gap-10">
        {/* Donut — visual lead. Mint slice = Paid, violet slice = Organic.
            Center label carries the cohort total. */}
        <div
          className="relative mx-auto h-48 w-48 shrink-0 md:mx-0 md:h-56 md:w-56"
          role="img"
          aria-label={
            hasData
              ? `Paid ${(paidPct * 100).toFixed(0)} percent, Organic ${(organicPct * 100).toFixed(0)} percent`
              : "No cohort subs in the active window"
          }
          data-testid="attribution-paid-vs-organic-donut"
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
                  const payload = (item as { payload?: { pct?: number } })?.payload;
                  const pct = payload?.pct ?? 0;
                  return [
                    `${safe.toLocaleString()} (${(pct * 100).toFixed(1)}%)`,
                    String(name),
                  ];
                }}
              />
              <Pie
                data={hasData ? pieData : [{ name: "Empty", value: 1, pct: 0, fill: "var(--surface-input)" }]}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius="62%"
                outerRadius="92%"
                paddingAngle={hasData ? 2 : 0}
                stroke="var(--surface-base)"
                strokeWidth={2}
                isAnimationActive={animated}
                animationBegin={0}
                animationDuration={900}
              >
                {(hasData ? pieData : [{ fill: "var(--surface-input)", name: "Empty", value: 1, pct: 0 }]).map((d) => (
                  <Cell key={d.name} fill={d.fill} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="font-body text-[10px] uppercase tracking-[0.16em] text-[color:var(--text-muted)]">
              Subs
            </span>
            <span className="font-display text-2xl font-extrabold text-cloud-white tabular-nums">
              {fmtCount(data.subTotal)}
            </span>
            <span className="font-body text-[10px] tabular-nums text-[color:var(--text-muted)]">
              in window
            </span>
          </div>
        </div>

        {/* Stat rows — Sub Total leads, Paid + Organic feed it. */}
        <ul className="flex flex-col gap-3">
          <StatRow
            id="paid-vs-organic-sub-total"
            label="Sub Total"
            count={data.subTotal}
            colorVar="var(--text-primary)"
          />
          <StatRow
            id="paid-vs-organic-sub-paid"
            label="Sub Paid"
            count={data.paid}
            share={paidPct}
            colorVar="var(--color-ua)"
            withSwatch
          />
          <StatRow
            id="paid-vs-organic-sub-organic"
            label="Sub Organic"
            count={data.organic}
            share={organicPct}
            colorVar="var(--color-organic)"
            withSwatch
          />
        </ul>
      </div>

      <p className="font-body text-xs leading-relaxed text-[color:var(--text-muted)]">
        Organic halo lifts paid efficiency. The higher the organic share, the lower BCAC tends to be.
      </p>
    </GlassCard>
  );
}

function StatRow({
  id,
  label,
  count,
  share,
  colorVar,
  withSwatch,
}: {
  id: string;
  label: string;
  count: number;
  share?: number;
  colorVar: string;
  withSwatch?: boolean;
}) {
  return (
    <li
      className="flex items-baseline gap-3 border-b border-[color:var(--border-subtle)] pb-2 last:border-b-0 last:pb-0"
      data-testid={`kpi-${id}`}
    >
      {withSwatch && (
        <span
          aria-hidden
          className="mt-1 inline-block h-2.5 w-2.5 shrink-0 self-start rounded-full"
          style={{ background: colorVar, boxShadow: `0 0 8px ${colorVar}` }}
        />
      )}
      <div className="flex flex-1 items-baseline justify-between gap-3">
        <span className="font-body text-xs font-semibold uppercase tracking-wider text-[color:var(--text-muted)]">
          {label}
        </span>
        <div className="flex items-baseline gap-2">
          <span
            className="font-display text-2xl font-extrabold leading-none tabular-nums"
            style={{ color: colorVar }}
          >
            {fmtCount(count)}
          </span>
          {share != null && (
            <span className="font-body text-xs tabular-nums text-[color:var(--text-secondary)]">
              {(share * 100).toFixed(1)}%
            </span>
          )}
        </div>
      </div>
    </li>
  );
}
