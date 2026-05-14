"use client";

import { ArrowLeft, ArrowUp } from "lucide-react";
import { EditableText } from "../EditableText";
import { CALLOUT_HEX, CALLOUT_HIGHLIGHT_RGBA } from "./callout";
import type {
  CalloutColor,
  CampaignCommentary,
  CampaignRow,
} from "@/lib/reports/types";

type CampaignBreakdownProps = {
  rows: CampaignRow[];
  commentary: CampaignCommentary[];
  /** Editable in the document view, read-only in share / print. */
  readOnly?: boolean;
  onCommentaryChange?: (next: CampaignCommentary[]) => void;
};

/**
 * The "secret sauce" template. Renders the per-campaign table with blue
 * spend / gray cost tints, red/green delta arrows, and an absolutely
 * positioned colored arrow on the right edge of any row that the
 * generator flagged. The commentary list below echoes those colors as
 * `<mark>` highlights — pink row in the table pairs with the pink phrase
 * in the paragraph beneath.
 */
export function CampaignBreakdown({
  rows,
  commentary,
  readOnly,
  onCommentaryChange,
}: CampaignBreakdownProps) {
  const maxSpend = Math.max(...rows.map((r) => r.spend), 1);
  const maxCost = Math.max(
    ...rows.flatMap((r) =>
      [r.cpSubstart, r.cpaD0, r.cpaD7 ?? 0].filter((n) => Number.isFinite(n)),
    ),
    1,
  );

  return (
    <div
      className="flex flex-col gap-5 rounded-xl px-6 py-6 print:break-inside-avoid"
      style={{ background: "var(--surface-light-card)" }}
    >
      <div className="relative overflow-x-auto">
        <table className="w-full border-collapse text-[12.5px]">
          <thead>
            <tr>
              <th className="border-b py-2 pl-2 pr-3 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-[color:var(--text-light-muted)]" style={{ borderColor: "var(--surface-light-line)" }}>
                Campaign
              </th>
              {(
                [
                  "Spend",
                  "Installs",
                  "CPI",
                  "SubStart",
                  "CP SubStart",
                  "%Δ",
                  "Sub D0",
                  "CPA D0",
                  "%Δ",
                  "Sub D7",
                  "CPA D7",
                ] as const
              ).map((h, i) => (
                <th
                  key={`${h}-${i}`}
                  className="border-b px-2 py-2 text-right text-[10px] font-semibold uppercase tracking-[0.08em] text-[color:var(--text-light-muted)]"
                  style={{ borderColor: "var(--surface-light-line)" }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <CampaignTableRow
                key={r.campaignName}
                row={r}
                maxSpend={maxSpend}
                maxCost={maxCost}
              />
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col">
        {commentary.map((c, idx) => (
          <div
            key={`${c.groupLabel}-${idx}`}
            className="flex flex-col gap-2 border-t py-4 first:border-t-0 first:pt-2"
            style={{ borderColor: "var(--surface-light-line)" }}
          >
            <div className="font-body text-[13px] leading-relaxed text-[color:var(--text-light-primary)]">
              <span className="font-bold text-[color:var(--text-light-primary)]">
                {c.groupLabel}:
              </span>{" "}
              <HighlightedText text={c.observation} highlights={c.highlights} />
            </div>
            <div className="flex flex-wrap items-start gap-2">
              <span
                className="inline-flex shrink-0 items-center rounded-md px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.06em]"
                style={{
                  background: "var(--color-yellow)",
                  color: "var(--color-navy)",
                }}
              >
                {"<>"} Action Item
              </span>
              {readOnly ? (
                <p className="font-body text-[13px] leading-relaxed text-[color:var(--text-light-primary)]">
                  {c.actionItem}
                </p>
              ) : (
                <EditableText
                  value={c.actionItem}
                  onChange={(next) => {
                    if (!onCommentaryChange) return;
                    onCommentaryChange(
                      commentary.map((x, j) =>
                        j === idx ? { ...x, actionItem: next } : x,
                      ),
                    );
                  }}
                  multiline
                  ariaLabel={`${c.groupLabel} action item`}
                  className="flex-1 font-body text-[13px] leading-relaxed text-[color:var(--text-light-primary)] min-h-[1.5rem]"
                />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CampaignTableRow({
  row,
  maxSpend,
  maxCost,
}: {
  row: CampaignRow;
  maxSpend: number;
  maxCost: number;
}) {
  const callout = row.highlight;
  return (
    <tr
      className="relative border-b"
      style={{
        borderColor: "var(--surface-light-line)",
      }}
    >
      <td
        className="max-w-[260px] truncate py-2.5 pl-2 pr-3 font-medium text-[color:var(--text-light-primary)]"
        title={row.campaignName}
      >
        {row.campaignName}
      </td>
      <td className="px-2 py-2.5 text-right tabular-nums" style={spendTint(row.spend, maxSpend)}>
        {formatMoney(row.spend)}
      </td>
      <td className="px-2 py-2.5 text-right tabular-nums text-[color:var(--text-light-primary)]">
        {row.installs.toLocaleString()}
      </td>
      <td className="px-2 py-2.5 text-right tabular-nums text-[color:var(--text-light-primary)]">
        ${row.cpi.toFixed(2)}
      </td>
      <td className="px-2 py-2.5 text-right tabular-nums text-[color:var(--text-light-primary)]">
        {row.substart}
      </td>
      <td className="px-2 py-2.5 text-right tabular-nums" style={costTint(row.cpSubstart, maxCost)}>
        ${row.cpSubstart.toFixed(2)}
      </td>
      <td className="px-2 py-2.5 text-right tabular-nums">
        <DeltaChip delta={row.cpSubstartDelta} polarity="down-good" />
      </td>
      <td className="px-2 py-2.5 text-right tabular-nums text-[color:var(--text-light-primary)]">
        {row.subD0}
      </td>
      <td className="px-2 py-2.5 text-right tabular-nums" style={costTint(row.cpaD0, maxCost)}>
        ${row.cpaD0.toFixed(2)}
      </td>
      <td className="px-2 py-2.5 text-right tabular-nums">
        <DeltaChip delta={row.cpaD0Delta} polarity="down-good" />
      </td>
      <td className="px-2 py-2.5 text-right tabular-nums text-[color:var(--text-light-secondary)]">
        {row.subD7 === null ? "—" : row.subD7}
      </td>
      <td
        className="relative py-2.5 pl-2 pr-7 text-right tabular-nums"
        style={row.cpaD7 !== null ? costTint(row.cpaD7, maxCost) : undefined}
      >
        {row.cpaD7 === null ? (
          <span className="text-[color:var(--text-light-muted)]">—</span>
        ) : (
          `$${row.cpaD7.toFixed(2)}`
        )}
        {callout && <CalloutArrow color={callout} />}
      </td>
    </tr>
  );
}

function CalloutArrow({ color }: { color: CalloutColor }) {
  // Reference deck anchors the arrow inside the last cell at the right
  // edge so it always renders even when the table is in an overflow-x
  // scroller. The cell has position: relative, the arrow position:
  // absolute right-2.
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute right-1 top-1/2 -translate-y-1/2"
      style={{ color: CALLOUT_HEX[color] }}
    >
      <ArrowLeft className="h-5 w-5" strokeWidth={3} />
    </span>
  );
}

function DeltaChip({
  delta,
  polarity,
}: {
  delta: number | null;
  polarity: "up-good" | "down-good";
}) {
  if (delta === null || !Number.isFinite(delta) || delta === 0) {
    return <span className="text-[color:var(--text-light-muted)]">—</span>;
  }
  const up = delta > 0;
  const good = polarity === "up-good" ? up : !up;
  const color = good ? "#16A34A" : "#DC2626";
  return (
    <span
      className="inline-flex items-center gap-0.5 text-[11px] font-semibold"
      style={{ color }}
    >
      <ArrowUp
        className="h-3 w-3"
        strokeWidth={2.5}
        style={{ transform: up ? "none" : "rotate(180deg)" }}
      />
      {Math.abs(delta).toFixed(1)}%
    </span>
  );
}

function HighlightedText({
  text,
  highlights,
}: {
  text: string;
  highlights?: { color: CalloutColor; phrase: string }[];
}) {
  if (!highlights || highlights.length === 0) {
    return <>{text}</>;
  }

  // Split the text on the first match of each phrase, in order.
  // Phrases are matched left-to-right and case-insensitively.
  const parts: { text: string; color?: CalloutColor }[] = [{ text }];
  for (const h of highlights) {
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (p.color) continue;
      const idx = p.text.toLowerCase().indexOf(h.phrase.toLowerCase());
      if (idx === -1) continue;
      const before = p.text.slice(0, idx);
      const match = p.text.slice(idx, idx + h.phrase.length);
      const after = p.text.slice(idx + h.phrase.length);
      const replacement: { text: string; color?: CalloutColor }[] = [];
      if (before) replacement.push({ text: before });
      replacement.push({ text: match, color: h.color });
      if (after) replacement.push({ text: after });
      parts.splice(i, 1, ...replacement);
      break;
    }
  }

  return (
    <>
      {parts.map((p, i) =>
        p.color ? (
          <mark
            key={i}
            style={{
              background: CALLOUT_HIGHLIGHT_RGBA[p.color],
              color: "var(--text-light-primary)",
              padding: "1px 4px",
              borderRadius: 3,
            }}
          >
            {p.text}
          </mark>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

function spendTint(value: number, max: number): React.CSSProperties {
  const intensity = Math.min(1, Math.max(0.12, value / max));
  return {
    background: `rgba(91, 177, 255, ${0.12 + intensity * 0.32})`,
    fontWeight: 600,
    color: "var(--text-light-primary)",
  };
}

function costTint(value: number, max: number): React.CSSProperties {
  const intensity = Math.min(1, Math.max(0.12, value / max));
  return {
    background: `rgba(120, 130, 145, ${0.10 + intensity * 0.22})`,
    color: "var(--text-light-primary)",
  };
}

function formatMoney(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n >= 1000) return `$${(n / 1000).toFixed(2)}k`;
  return `$${n.toFixed(0)}`;
}
