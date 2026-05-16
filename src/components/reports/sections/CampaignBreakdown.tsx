"use client";

import { ArrowLeft, ArrowUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { EditableText } from "../EditableText";
import { CALLOUT_HEX, CALLOUT_HIGHLIGHT_RGBA } from "./callout";
import type {
  CalloutColor,
  CampaignCommentary,
  CampaignRow,
  ProseBlock,
} from "@/lib/reports/types";
import { ProseBlockView } from "./ProseBlock";

type CampaignBreakdownProps = {
  rows: CampaignRow[];
  commentary: CampaignCommentary[];
  /** Smart Reports prose (Phase 1). When populated, replaces the
   *  per-campaign commentary list with one prose block per family. */
  prose?: ProseBlock[];
  /** Editable in the document view, read-only in share / print. */
  readOnly?: boolean;
  onCommentaryChange?: (next: CampaignCommentary[]) => void;
  /** Slide-fit variant: tighter padding + smaller fonts so a typical
   *  carousel slide (5 rows + 1 commentary block) fits the 16:9 frame. */
  compact?: boolean;
  /** When true, prose blocks become editable. The parent threads
   *  changes back through `onProseChange`. */
  editable?: boolean;
  onProseChange?: (next: ProseBlock[]) => void;
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
  prose,
  readOnly,
  onCommentaryChange,
  compact = false,
  editable = false,
  onProseChange,
}: CampaignBreakdownProps) {
  const maxSpend = Math.max(...rows.map((r) => r.spend), 1);
  const maxCost = Math.max(
    ...rows.flatMap((r) =>
      [r.cpSubstart, r.cpaD0, r.cpaD7 ?? 0].filter((n) => Number.isFinite(n)),
    ),
    1,
  );

  // Hermes-drafted reports populate spend / installs / CPI from BQ but
  // leave the sub-funnel columns (SubStart / CP SubStart / Sub D0 /
  // CPA D0 / Sub D7 / CPA D7) at 0 because BQ's campaign-cohort join
  // is unreliable. Rendering eight $0 columns next to real spend
  // numbers reads as "campaigns have no subs" instead of "we can't
  // attribute subs to campaigns" (a worse lie than just hiding the
  // columns). Manual reports populate the full set so the
  // check is per-render: hide only when EVERY row is zero across the
  // sub-funnel.
  const hasSubFunnelData = rows.some(
    (r) =>
      r.substart > 0 ||
      r.cpSubstart > 0 ||
      r.subD0 > 0 ||
      r.cpaD0 > 0 ||
      (r.subD7 ?? 0) > 0 ||
      (r.cpaD7 ?? 0) > 0,
  );

  // Continuation slides can carry just rows or just commentary; the layout
  // step decides what fits. Both halves render independently so a missing
  // half doesn't leave a header band hanging.
  //
  // Phase 1 cutover: when Smart Reports populates the `prose` field,
  // we render those blocks (one per campaign family) and skip the
  // legacy per-campaign commentary list. Legacy reports still render
  // commentary as before.
  const hasRows = rows.length > 0;
  const hasProse = (prose?.length ?? 0) > 0;
  const hasCommentary = commentary.length > 0 && !hasProse;

  const cellPad = compact ? "px-1.5 py-1" : "px-2 py-2.5";
  const headerPad = compact ? "px-1.5 py-1" : "px-2 py-2";
  const headerText = compact ? "text-[9px]" : "text-[10px]";
  const tableText = compact ? "text-[10.5px]" : "text-[12.5px]";

  return (
    <div
      className={cn(
        "flex flex-col rounded-xl print:break-inside-avoid",
        compact ? "gap-3 px-4 py-3" : "gap-5 px-6 py-6",
      )}
      style={{ background: "var(--surface-light-card)" }}
    >
      {hasRows && (
      <div className="relative overflow-x-auto">
        <table className={cn("w-full border-collapse", tableText)}>
          <thead>
            <tr>
              <th className={cn("border-b text-left font-semibold uppercase tracking-[0.08em] text-[color:var(--text-light-muted)]", compact ? "pl-1.5 pr-2 py-1" : "pl-2 pr-3 py-2", headerText)} style={{ borderColor: "var(--surface-light-line)" }}>
                Campaign
              </th>
              {(
                hasSubFunnelData
                  ? ([
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
                    ] as const)
                  : (["Spend", "Installs", "CPI"] as const)
              ).map((h, i) => (
                <th
                  key={`${h}-${i}`}
                  // whitespace-nowrap so "Installs", "SubStart", "Sub D7"
                  // etc. cannot break mid-word when overflow-x-auto on
                  // the outer container narrows the table.
                  className={cn(
                    "whitespace-nowrap border-b text-right font-semibold uppercase tracking-[0.08em] text-[color:var(--text-light-muted)]",
                    headerPad,
                    headerText,
                  )}
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
                compact={compact}
                cellPad={cellPad}
                showSubFunnel={hasSubFunnelData}
              />
            ))}
          </tbody>
        </table>
      </div>
      )}

      {hasProse && prose && (
        <div className="flex flex-col gap-3">
          {prose.map((block, i) => (
            <div
              key={i}
              className={cn(
                "flex flex-col border-t first:border-t-0 first:pt-1",
                compact ? "gap-1 py-2" : "gap-2 py-4",
              )}
              style={{ borderColor: "var(--surface-light-line)" }}
            >
              <ProseBlockView
                block={block}
                compact={compact}
                editable={editable}
                onChange={(next) =>
                  onProseChange?.(prose.map((b, j) => (j === i ? next : b)))
                }
              />
            </div>
          ))}
        </div>
      )}

      {hasCommentary && (
      <div className="flex flex-col">
        {commentary.map((c, idx) => (
          <div
            key={`${c.groupLabel}-${idx}`}
            className={cn(
              "flex flex-col border-t first:border-t-0 first:pt-1",
              compact ? "gap-1 py-2" : "gap-2 py-4",
            )}
            style={{ borderColor: "var(--surface-light-line)" }}
          >
            <div className={cn(
              "font-body leading-relaxed text-[color:var(--text-light-primary)]",
              compact ? "text-[11.5px]" : "text-[13px]",
            )}>
              <span className="font-bold text-[color:var(--text-light-primary)]">
                {c.groupLabel}:
              </span>{" "}
              <HighlightedText text={c.observation} highlights={c.highlights} />
            </div>
            <div className={cn("flex flex-wrap items-start", compact ? "gap-1.5" : "gap-2")}>
              <span
                className={cn(
                  "inline-flex shrink-0 items-center rounded-md font-mono font-bold uppercase tracking-[0.06em]",
                  compact ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-1 text-[10px]",
                )}
                style={{
                  background: "var(--color-yellow)",
                  color: "var(--color-navy)",
                }}
              >
                {"<>"} Action Item
              </span>
              {readOnly ? (
                <p className={cn(
                  "font-body leading-relaxed text-[color:var(--text-light-primary)]",
                  compact ? "text-[11.5px]" : "text-[13px]",
                )}>
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
                  className={cn(
                    "flex-1 font-body leading-relaxed text-[color:var(--text-light-primary)] min-h-[1.5rem]",
                    compact ? "text-[11.5px]" : "text-[13px]",
                  )}
                />
              )}
            </div>
          </div>
        ))}
      </div>
      )}
    </div>
  );
}

function CampaignTableRow({
  row,
  maxSpend,
  maxCost,
  compact = false,
  cellPad,
  showSubFunnel = true,
}: {
  row: CampaignRow;
  maxSpend: number;
  maxCost: number;
  compact?: boolean;
  cellPad: string;
  /** When false, the SubStart / CP SubStart / Sub D0 / CPA D0 / Sub D7 /
   *  CPA D7 columns and their delta chips are skipped. The callout
   *  arrow (which normally rides on CPA D7) shifts onto CPI in that
   *  case so a Hermes-drafted highlight still has somewhere to land. */
  showSubFunnel?: boolean;
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
        className={cn(
          "font-medium text-[color:var(--text-light-primary)]",
          compact ? "py-1 pl-1.5 pr-2" : "py-2.5 pl-2 pr-3",
        )}
        title={row.campaignName}
        // Campaign names like "YH_FB_APP_FULL_IAP_..." share a long prefix
        // and only differ at the tail; truncating would make rows
        // indistinguishable. Allow break-anywhere wrap so the
        // distinguishing tail is always visible.
        style={{ wordBreak: "break-word" }}
      >
        {row.campaignName}
      </td>
      <td className={cn("text-right tabular-nums", cellPad)} style={spendTint(row.spend, maxSpend)}>
        {formatMoney(row.spend)}
      </td>
      <td className={cn("text-right tabular-nums text-[color:var(--text-light-primary)]", cellPad)}>
        {row.installs.toLocaleString()}
      </td>
      <td
        className={cn(
          "relative text-right tabular-nums text-[color:var(--text-light-primary)]",
          showSubFunnel
            ? cellPad
            : compact
              ? "py-1 pl-1.5 pr-5"
              : "py-2.5 pl-2 pr-7",
        )}
      >
        ${row.cpi.toFixed(2)}
        {!showSubFunnel && callout && (
          <CalloutArrow color={callout} compact={compact} />
        )}
      </td>
      {showSubFunnel && (
        <>
          <td className={cn("text-right tabular-nums text-[color:var(--text-light-primary)]", cellPad)}>
            {row.substart}
          </td>
          <td className={cn("text-right tabular-nums", cellPad)} style={costTint(row.cpSubstart, maxCost)}>
            ${row.cpSubstart.toFixed(2)}
          </td>
          <td className={cn("text-right tabular-nums", cellPad)}>
            <DeltaChip delta={row.cpSubstartDelta} polarity="down-good" compact={compact} />
          </td>
          <td className={cn("text-right tabular-nums text-[color:var(--text-light-primary)]", cellPad)}>
            {row.subD0}
          </td>
          <td className={cn("text-right tabular-nums", cellPad)} style={costTint(row.cpaD0, maxCost)}>
            ${row.cpaD0.toFixed(2)}
          </td>
          <td className={cn("text-right tabular-nums", cellPad)}>
            <DeltaChip delta={row.cpaD0Delta} polarity="down-good" compact={compact} />
          </td>
          <td className={cn("text-right tabular-nums text-[color:var(--text-light-secondary)]", cellPad)}>
            {row.subD7 === null ? "—" : row.subD7}
          </td>
          <td
            className={cn(
              "relative text-right tabular-nums",
              compact ? "py-1 pl-1.5 pr-5" : "py-2.5 pl-2 pr-7",
            )}
            style={row.cpaD7 !== null ? costTint(row.cpaD7, maxCost) : undefined}
          >
            {row.cpaD7 === null ? (
              <span className="text-[color:var(--text-light-muted)]">—</span>
            ) : (
              `$${row.cpaD7.toFixed(2)}`
            )}
            {callout && <CalloutArrow color={callout} compact={compact} />}
          </td>
        </>
      )}
    </tr>
  );
}

function CalloutArrow({ color, compact = false }: { color: CalloutColor; compact?: boolean }) {
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
      <ArrowLeft className={compact ? "h-3.5 w-3.5" : "h-5 w-5"} strokeWidth={3} />
    </span>
  );
}

function DeltaChip({
  delta,
  polarity,
  compact = false,
}: {
  delta: number | null;
  polarity: "up-good" | "down-good";
  compact?: boolean;
}) {
  if (delta === null || !Number.isFinite(delta) || delta === 0) {
    return <span className="text-[color:var(--text-light-muted)]">—</span>;
  }
  const up = delta > 0;
  const good = polarity === "up-good" ? up : !up;
  const color = good ? "#16A34A" : "#DC2626";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 font-semibold",
        compact ? "text-[9px]" : "text-[11px]",
      )}
      style={{ color }}
    >
      <ArrowUp
        className={compact ? "h-2.5 w-2.5" : "h-3 w-3"}
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
