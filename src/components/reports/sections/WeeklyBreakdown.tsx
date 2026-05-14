import { ArrowDown, ArrowUp } from "lucide-react";
import type {
  HistoricalWeekRow,
  MetricValue,
  WeeklyBullet,
  WeeklySummaryRow,
  WeeklySummaryTable,
} from "@/lib/reports/types";

type WeeklyBreakdownProps = {
  /** Used by both the platform-overall (multi-row summary table) and the
   *  channel-weekly (single current-week row) variants. */
  summary?: WeeklySummaryTable;
  currentWeek?: WeeklySummaryRow;
  /** Optional last 3-4 weeks of context, only on channel-weekly. */
  history?: HistoricalWeekRow[];
  bullets: WeeklyBullet[];
};

/** Volume metrics: an increase reads as good, a decrease as bad. */
const VOLUME_KEYS = ["spend", "substart", "subD0", "subD7"] as const;
/** Unit-cost metrics: down is good, up is bad. */
const COST_KEYS = ["cpSubstart", "cpaD0", "cpaD7"] as const;

const VOLUME_LABELS: Record<(typeof VOLUME_KEYS)[number], string> = {
  spend: "Spend",
  substart: "SubStart",
  subD0: "Sub D0",
  subD7: "Sub D7",
};
const COST_LABELS: Record<(typeof COST_KEYS)[number], string> = {
  cpSubstart: "CP SubStart",
  cpaD0: "CPA D0",
  cpaD7: "CPA D7",
};

/**
 * Two-half summary table: volume metrics on the left, unit-cost metrics on
 * the right. Each cell shows the value plus a colored delta. Cost metrics
 * flip polarity (down arrow = green, up arrow = red).
 */
export function WeeklyBreakdown({
  summary,
  currentWeek,
  history,
  bullets,
}: WeeklyBreakdownProps) {
  // The platform-overall variant: one row per channel + totals.
  // The channel-weekly variant: a single "this week" row.
  const rows: WeeklySummaryRow[] = summary
    ? [...summary.rows, summary.total]
    : currentWeek
      ? [currentWeek]
      : [];

  const maxSpend = Math.max(
    ...rows.map((r) => (typeof r.spend.value === "number" ? r.spend.value : 0)),
    1,
  );
  const maxCost = Math.max(
    ...rows.flatMap((r) =>
      COST_KEYS.map((k) =>
        typeof r[k].value === "number" ? (r[k].value as number) : 0,
      ),
    ),
    1,
  );

  return (
    <div className="flex flex-col gap-5 rounded-xl px-6 py-6 print:break-inside-avoid" style={{ background: "var(--surface-light-card)" }}>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Volume half */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                <th className="border-b py-2 pr-3 text-left text-[10px] font-semibold uppercase tracking-[0.10em] text-[color:var(--text-light-muted)]" style={{ borderColor: "var(--surface-light-line)" }}>
                  Channel
                </th>
                {VOLUME_KEYS.map((k) => (
                  <th
                    key={k}
                    className="border-b py-2 px-2 text-right text-[10px] font-semibold uppercase tracking-[0.10em] text-[color:var(--text-light-muted)]"
                    style={{ borderColor: "var(--surface-light-line)" }}
                  >
                    {VOLUME_LABELS[k]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const isTotal = summary && i === rows.length - 1;
                return (
                  <tr
                    key={`v-${r.label}-${i}`}
                    className="border-b"
                    style={{
                      borderColor: "var(--surface-light-line)",
                      fontWeight: isTotal ? 700 : undefined,
                    }}
                  >
                    <td className="py-2.5 pr-3 font-semibold text-[color:var(--text-light-primary)]">
                      {r.label}
                    </td>
                    <td
                      className="px-2 py-2.5 text-right tabular-nums"
                      style={spendTint(r.spend, maxSpend)}
                    >
                      <MetricCell metric={r.spend} polarity="up-good" />
                    </td>
                    {(["substart", "subD0", "subD7"] as const).map((k) => (
                      <td
                        key={k}
                        className="px-2 py-2.5 text-right tabular-nums text-[color:var(--text-light-primary)]"
                      >
                        <MetricCell metric={r[k]} polarity="up-good" />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Cost half */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr>
                <th className="border-b py-2 pr-3 text-left text-[10px] font-semibold uppercase tracking-[0.10em] text-[color:var(--text-light-muted)]" style={{ borderColor: "var(--surface-light-line)" }}>
                  Channel
                </th>
                {COST_KEYS.map((k) => (
                  <th
                    key={k}
                    className="border-b py-2 px-2 text-right text-[10px] font-semibold uppercase tracking-[0.10em] text-[color:var(--text-light-muted)]"
                    style={{ borderColor: "var(--surface-light-line)" }}
                  >
                    {COST_LABELS[k]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const isTotal = summary && i === rows.length - 1;
                return (
                  <tr
                    key={`c-${r.label}-${i}`}
                    className="border-b"
                    style={{
                      borderColor: "var(--surface-light-line)",
                      fontWeight: isTotal ? 700 : undefined,
                    }}
                  >
                    <td className="py-2.5 pr-3 font-semibold text-[color:var(--text-light-primary)]">
                      {r.label}
                    </td>
                    {COST_KEYS.map((k) => (
                      <td
                        key={k}
                        className="px-2 py-2.5 text-right tabular-nums"
                        style={costTint(r[k], maxCost)}
                      >
                        <MetricCell metric={r[k]} polarity="down-good" />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {history && history.length > 0 && (
        <HistoryTable rows={history} />
      )}

      {bullets.length > 0 && (
        <ul className="flex flex-col gap-2 pt-1">
          {bullets.map((b, i) => (
            <li
              key={i}
              className="font-body text-sm leading-relaxed"
              style={{
                color:
                  b.tone === "headline-bad"
                    ? "var(--color-creative)"
                    : b.tone === "headline-good"
                      ? "var(--color-ua)"
                      : "var(--text-light-secondary)",
                fontWeight: b.tone === "headline-bad" || b.tone === "headline-good" ? 600 : 400,
              }}
            >
              <span aria-hidden className="mr-2 inline-block translate-y-[-1px] text-[color:var(--text-light-muted)]">·</span>
              {b.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Renders a metric value + delta with the right arrow direction and color.
 * `polarity` decides which direction reads as good for this metric class.
 */
function MetricCell({
  metric,
  polarity,
}: {
  metric: MetricValue;
  polarity: "up-good" | "down-good";
}) {
  const { value, delta, maturing } = metric;
  const display =
    typeof value === "number" ? formatNumber(value) : value;

  let toneColor: string | null = null;
  let Arrow: typeof ArrowUp | null = null;
  if (typeof delta === "number" && Number.isFinite(delta) && delta !== 0) {
    const up = delta > 0;
    Arrow = up ? ArrowUp : ArrowDown;
    const good = polarity === "up-good" ? up : !up;
    toneColor = good ? "#16A34A" : "#DC2626";
  }

  return (
    <span className="inline-flex items-baseline justify-end gap-1.5">
      <span
        className="font-semibold text-[color:var(--text-light-primary)]"
        style={maturing ? { opacity: 0.55 } : undefined}
      >
        {maturing && (value === null || value === undefined) ? "—" : display}
      </span>
      {Arrow && (
        <span
          className="inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums"
          style={{ color: toneColor ?? undefined }}
        >
          <Arrow className="h-3 w-3" strokeWidth={2.5} />
          {Math.abs(delta as number).toFixed(1)}%
        </span>
      )}
    </span>
  );
}

function HistoryTable({ rows }: { rows: HistoricalWeekRow[] }) {
  return (
    <div className="overflow-x-auto rounded-md" style={{ border: "1px solid var(--surface-light-line)" }}>
      <table className="w-full border-collapse text-[12px]">
        <thead>
          <tr>
            <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.10em] text-[color:var(--text-light-muted)]">
              Week
            </th>
            <th className="px-2 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.10em] text-[color:var(--text-light-muted)]">
              Range
            </th>
            {(["Spend", "Installs", "CPI", "SubStart", "CP SubStart", "Sub D0", "CPA D0", "Sub D7", "CPA D7"] as const).map((h) => (
              <th key={h} className="px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.10em] text-[color:var(--text-light-muted)]">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-t" style={{ borderColor: "var(--surface-light-line)" }}>
              <td className="px-2 py-2 font-semibold text-[color:var(--text-light-primary)]">
                {r.label}
              </td>
              <td className="px-2 py-2 text-[color:var(--text-light-secondary)]">
                {r.range}
              </td>
              <td className="px-2 py-2 text-right tabular-nums text-[color:var(--text-light-primary)]">
                {formatMoney(r.spend)}
              </td>
              <td className="px-2 py-2 text-right tabular-nums text-[color:var(--text-light-secondary)]">
                {formatNumber(r.impressions)}
              </td>
              <td className="px-2 py-2 text-right tabular-nums text-[color:var(--text-light-primary)]">
                ${r.cpi.toFixed(2)}
              </td>
              <td className="px-2 py-2 text-right tabular-nums text-[color:var(--text-light-primary)]">
                {r.substart}
              </td>
              <td className="px-2 py-2 text-right tabular-nums text-[color:var(--text-light-primary)]">
                ${r.cpSubstart.toFixed(2)}
              </td>
              <td className="px-2 py-2 text-right tabular-nums text-[color:var(--text-light-primary)]">
                {r.subD0}
              </td>
              <td className="px-2 py-2 text-right tabular-nums text-[color:var(--text-light-primary)]">
                ${r.cpaD0.toFixed(2)}
              </td>
              <td className="px-2 py-2 text-right tabular-nums text-[color:var(--text-light-secondary)]">
                {r.subD7 === null ? "—" : r.subD7}
              </td>
              <td className="px-2 py-2 text-right tabular-nums text-[color:var(--text-light-secondary)]">
                {r.cpaD7 === null ? "—" : `$${r.cpaD7.toFixed(2)}`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function spendTint(m: MetricValue, max: number): React.CSSProperties {
  const v = typeof m.value === "number" ? m.value : 0;
  const intensity = Math.min(1, Math.max(0.12, v / max));
  return {
    background: `rgba(91, 177, 255, ${0.10 + intensity * 0.28})`,
    fontWeight: 600,
  };
}

function costTint(m: MetricValue, max: number): React.CSSProperties {
  const v = typeof m.value === "number" ? m.value : 0;
  const intensity = Math.min(1, Math.max(0.12, v / max));
  return {
    background: `rgba(120, 130, 145, ${0.08 + intensity * 0.18})`,
  };
}

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 0 });
  if (Number.isInteger(n)) return n.toString();
  return n.toFixed(2);
}

function formatMoney(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}
