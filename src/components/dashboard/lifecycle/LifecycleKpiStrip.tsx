"use client";

import { KpiCard } from "@/components/dashboard/KpiCard";
import type {
  LifecycleDeltas,
  LifecycleSparklines,
  LifecycleTotals,
} from "@/lib/lifecycle/use-lifecycle-data";

type Props = {
  totals: LifecycleTotals;
  deltas: LifecycleDeltas;
  sparklines: LifecycleSparklines;
};

const fmtCount = (n: number) => Math.round(n).toLocaleString();

/**
 * Three KpiCard tiles in a row — the Lifecycle tab's headline numbers
 * for the active window. Reuses the same KpiCard the Performance tab
 * uses so the tab-to-tab feel is uniform.
 *
 *   New Subs        — higher-better
 *   Cancellations   — lower-better (delta inverts: red when positive)
 *   Net Sub         — higher-better, highlighted (the page hero)
 *
 * Each tile takes a per-day sparkline rolled up across OS (we don't
 * split by iOS / Android / Web in the tile spark; that's the OsMixCard's
 * job). KpiCard handles the count-up animation, delta chip with sign
 * inversion via `direction`, and the staggered entry.
 */
export function LifecycleKpiStrip({ totals, deltas, sparklines }: Props) {
  return (
    <div
      className="grid grid-cols-1 gap-3 md:grid-cols-3 md:gap-4"
      data-testid="lifecycle-kpi-strip"
    >
      <KpiCard
        id="lifecycle-new-subs"
        label="New subscribers"
        value={fmtCount(totals.subs)}
        delta={deltas.subs}
        direction="higher-better"
        size="compact"
        enterIndex={1}
        series={sparklines.subs}
      />
      <KpiCard
        id="lifecycle-cancellations"
        label="Cancellations"
        value={fmtCount(totals.churn)}
        delta={deltas.churn}
        direction="lower-better"
        size="compact"
        enterIndex={2}
        series={sparklines.churn}
      />
      <KpiCard
        id="lifecycle-net-sub"
        label="Net Sub"
        value={fmtCount(totals.netSub)}
        delta={deltas.netSub}
        direction="higher-better"
        size="compact"
        enterIndex={3}
        highlight
        series={sparklines.netSub}
      />
    </div>
  );
}
