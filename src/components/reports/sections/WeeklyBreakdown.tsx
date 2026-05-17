import { ArrowDown, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  HistoricalWeekRow,
  MetricValue,
  ProseBlock,
  WeeklyBullet,
  WeeklySummaryRow,
  WeeklySummaryTable,
} from "@/lib/reports/types";
import { ProseBlockView } from "./ProseBlock";

type WeeklyBreakdownProps = {
  /** Used by both the platform-overall (multi-row summary table) and the
   *  channel-weekly (single current-week row) variants. */
  summary?: WeeklySummaryTable;
  currentWeek?: WeeklySummaryRow;
  /** Optional last 3-4 weeks of context, only on channel-weekly. */
  history?: HistoricalWeekRow[];
  bullets: WeeklyBullet[];
  /** Smart Reports prose. When populated, the renderer shows prose
   *  blocks; bullets fall back to a secondary list below. */
  prose?: ProseBlock[];
  /** Slide-fit variant: tighter padding + smaller fonts so the table +
   *  bullets pack into a 16:9 frame. */
  compact?: boolean;
  /** When true, prose blocks become editable. The parent owns the
   *  prose state and patches the report via `onProseChange`. */
  editable?: boolean;
  onProseChange?: (next: ProseBlock[]) => void;
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
  prose,
  compact = false,
  editable = false,
  onProseChange,
}: WeeklyBreakdownProps) {
  // The platform-overall variant: one row per channel + totals.
  // The channel-weekly variant: a single "this week" row.
  // Continuation slides may carry neither, in which case the two-half
  // summary block is skipped entirely and we only render history / bullets.
  const rows: WeeklySummaryRow[] = summary
    ? [...summary.rows, summary.total]
    : currentWeek
      ? [currentWeek]
      : [];
  const hasSummary = rows.length > 0;

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

  const cellPad = compact ? "px-1.5 py-1" : "px-2 py-2.5";
  const labelPad = compact ? "py-1 pr-2" : "py-2.5 pr-3";
  const tableText = compact ? "text-[11px]" : "text-[13px]";
  const headerText = compact ? "text-[9px]" : "text-[10px]";

  return (
    <div
      className={cn(
        "flex flex-col rounded-xl print:break-inside-avoid",
        compact ? "gap-2 px-4 py-3" : "gap-5 px-6 py-6",
      )}
      style={{ background: "var(--surface-light-card)" }}
    >
      {hasSummary && (
      <div className={cn("grid grid-cols-1 lg:grid-cols-2", compact ? "gap-3" : "gap-4")}>
        {/* Volume half */}
        <div className="overflow-x-auto">
          <table className={cn("w-full border-collapse", tableText)}>
            <thead>
              <tr>
                <th className={cn("border-b text-left font-semibold uppercase tracking-[0.10em] text-[color:var(--text-light-muted)]", labelPad, headerText)} style={{ borderColor: "var(--surface-light-line)" }}>
                  Channel
                </th>
                {VOLUME_KEYS.map((k) => (
                  <th
                    key={k}
                    className={cn("border-b text-right font-semibold uppercase tracking-[0.10em] text-[color:var(--text-light-muted)]", cellPad, headerText)}
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
                    <td className={cn("font-semibold text-[color:var(--text-light-primary)]", labelPad)}>
                      {r.label}
                    </td>
                    <td
                      className={cn("text-right tabular-nums", cellPad)}
                      style={spendTint(r.spend, maxSpend)}
                    >
                      <MetricCell metric={r.spend} polarity="up-good" compact={compact} />
                    </td>
                    {(["substart", "subD0", "subD7"] as const).map((k) => (
                      <td
                        key={k}
                        className={cn("text-right tabular-nums text-[color:var(--text-light-primary)]", cellPad)}
                      >
                        <MetricCell metric={r[k]} polarity="up-good" compact={compact} />
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
          <table className={cn("w-full border-collapse", tableText)}>
            <thead>
              <tr>
                <th className={cn("border-b text-left font-semibold uppercase tracking-[0.10em] text-[color:var(--text-light-muted)]", labelPad, headerText)} style={{ borderColor: "var(--surface-light-line)" }}>
                  Channel
                </th>
                {COST_KEYS.map((k) => (
                  <th
                    key={k}
                    className={cn("border-b text-right font-semibold uppercase tracking-[0.10em] text-[color:var(--text-light-muted)]", cellPad, headerText)}
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
                    <td className={cn("font-semibold text-[color:var(--text-light-primary)]", labelPad)}>
                      {r.label}
                    </td>
                    {COST_KEYS.map((k) => (
                      <td
                        key={k}
                        className={cn("text-right tabular-nums", cellPad)}
                        style={costTint(r[k], maxCost)}
                      >
                        <MetricCell metric={r[k]} polarity="down-good" compact={compact} />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {history && history.length > 0 && (
        <HistoryTable rows={history} compact={compact} />
      )}

      {prose && prose.length > 0 && (
        <div className={cn("flex flex-col", compact ? "gap-2" : "gap-3", "pt-1")}>
          {prose.map((block, i) => (
            <ProseBlockView
              key={i}
              block={block}
              compact={compact}
              editable={editable}
              onChange={(next) =>
                onProseChange?.(prose.map((b, j) => (j === i ? next : b)))
              }
            />
          ))}
        </div>
      )}

      {bullets.length > 0 && (
        <ul className={cn("flex flex-col pt-1", compact ? "gap-1" : "gap-2")}>
          {bullets.map((b, i) => (
            <li
              key={i}
              className={cn(
                "font-body leading-relaxed",
                compact ? "text-[12px]" : "text-sm",
              )}
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
  compact = false,
}: {
  metric: MetricValue;
  polarity: "up-good" | "down-good";
  compact?: boolean;
}) {
  const { value, delta, maturing } = metric;
  // Suppress to em-dash on null OR on (value === 0 && maturing). A
  // zero under a maturing flag reads as "cohort hasn't settled,
  // ignore" rather than a real zero. Non-zero values still render
  // even when maturing -- the number is information; maturing is
  // just a qualifier we show via reduced opacity.
  const isSuppressed =
    value === null ||
    value === undefined ||
    (typeof value === "number" && value === 0 && maturing === true);
  const display =
    typeof value === "number" ? formatNumber(value) : value;

  let toneColor: string | null = null;
  let Arrow: typeof ArrowUp | null = null;
  if (
    !isSuppressed &&
    typeof delta === "number" &&
    Number.isFinite(delta) &&
    delta !== 0
  ) {
    const up = delta > 0;
    Arrow = up ? ArrowUp : ArrowDown;
    const good = polarity === "up-good" ? up : !up;
    toneColor = good ? "#16A34A" : "#DC2626";
  }

  return (
    <span className="inline-flex items-baseline justify-end gap-1">
      <span
        className="font-semibold text-[color:var(--text-light-primary)]"
        style={maturing ? { opacity: 0.55 } : undefined}
      >
        {isSuppressed ? "—" : display}
      </span>
      {Arrow && (
        <span
          className={cn(
            "inline-flex items-center gap-0.5 font-semibold tabular-nums",
            compact ? "text-[9px]" : "text-[11px]",
          )}
          style={{ color: toneColor ?? undefined }}
        >
          <Arrow className={compact ? "h-2.5 w-2.5" : "h-3 w-3"} strokeWidth={2.5} />
          {Math.abs(delta as number).toFixed(1)}%
        </span>
      )}
    </span>
  );
}

function HistoryTable({ rows, compact = false }: { rows: HistoricalWeekRow[]; compact?: boolean }) {
  const cellPad = compact ? "px-1.5 py-1" : "px-2 py-2";
  const headerText = compact ? "text-[9px]" : "text-[10px]";
  const tableText = compact ? "text-[10.5px]" : "text-[12px]";
  return (
    <div className="overflow-x-auto rounded-md" style={{ border: "1px solid var(--surface-light-line)" }}>
      <table className={cn("w-full border-collapse", tableText)}>
        <thead>
          <tr>
            <th className={cn("text-left font-semibold uppercase tracking-[0.10em] text-[color:var(--text-light-muted)]", cellPad, headerText)}>
              Week
            </th>
            <th className={cn("text-left font-semibold uppercase tracking-[0.10em] text-[color:var(--text-light-muted)]", cellPad, headerText)}>
              Range
            </th>
            {(["Spend", "Installs", "CPI", "SubStart", "CP SubStart", "Sub D0", "CPA D0", "Sub D7", "CPA D7"] as const).map((h) => (
              <th key={h} className={cn("text-right font-semibold uppercase tracking-[0.10em] text-[color:var(--text-light-muted)]", cellPad, headerText)}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-t" style={{ borderColor: "var(--surface-light-line)" }}>
              <td className={cn("font-semibold text-[color:var(--text-light-primary)]", cellPad)}>
                {r.label}
              </td>
              <td className={cn("text-[color:var(--text-light-secondary)]", cellPad)}>
                {r.range}
              </td>
              <td className={cn("text-right tabular-nums text-[color:var(--text-light-primary)]", cellPad)}>
                {formatMoney(r.spend)}
              </td>
              <td className={cn("text-right tabular-nums text-[color:var(--text-light-secondary)]", cellPad)}>
                {formatNumber(r.impressions)}
              </td>
              <td className={cn("text-right tabular-nums text-[color:var(--text-light-primary)]", cellPad)}>
                ${r.cpi.toFixed(2)}
              </td>
              <td className={cn("text-right tabular-nums text-[color:var(--text-light-primary)]", cellPad)}>
                {r.substart}
              </td>
              <td className={cn("text-right tabular-nums text-[color:var(--text-light-primary)]", cellPad)}>
                ${r.cpSubstart.toFixed(2)}
              </td>
              <td className={cn("text-right tabular-nums text-[color:var(--text-light-primary)]", cellPad)}>
                {r.subD0}
              </td>
              <td className={cn("text-right tabular-nums text-[color:var(--text-light-primary)]", cellPad)}>
                ${r.cpaD0.toFixed(2)}
              </td>
              <td className={cn("text-right tabular-nums text-[color:var(--text-light-secondary)]", cellPad)}>
                {r.subD7 === null ? "—" : r.subD7}
              </td>
              <td className={cn("text-right tabular-nums text-[color:var(--text-light-secondary)]", cellPad)}>
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
