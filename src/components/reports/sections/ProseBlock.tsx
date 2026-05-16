import type { ProseBlock as ProseBlockData } from "@/lib/reports/types";
import { cn } from "@/lib/utils";

// Renders one prose block emitted by Smart Reports's composeReport.
// The text carries `[[highlight:N]]` placeholders; each N resolves to
// a ProseBlock.highlights[N] entry that the renderer paints as a
// colored span. Two flavors today:
//   - "good"  yellow background, bold text (positive callout)
//   - "bad"   pink   background, bold text (negative callout)
//
// Phase 3 will add a third "arrow" token that links the phrase to a
// specific row in the campaign table; the regex below stays
// permissive enough to ignore unknown placeholder kinds without
// crashing.

type Props = {
  block: ProseBlockData;
  /** Slide-fit variant: tighter padding + smaller fonts so the
   *  paragraph packs into a 16:9 frame. */
  compact?: boolean;
};

const PLACEHOLDER_RE = /\[\[highlight:(\d+)\]\]/g;

export function ProseBlockView({ block, compact }: Props) {
  const segments = splitOnPlaceholders(block.text, block.highlights);
  return (
    <div className={cn("flex flex-col", compact ? "gap-1" : "gap-2")}>
      {block.heading ? (
        <div
          className={cn(
            "font-body uppercase tracking-wider",
            compact ? "text-[10px]" : "text-xs",
          )}
          style={{ color: "var(--text-light-muted)" }}
        >
          {block.heading}
        </div>
      ) : null}
      <p
        className={cn(
          "font-body leading-relaxed",
          compact ? "text-[12px]" : "text-sm",
        )}
        style={{ color: "var(--text-light-secondary)" }}
      >
        {segments.map((seg, i) =>
          seg.kind === "text" ? (
            <span key={i}>{seg.text}</span>
          ) : (
            <mark
              key={i}
              className="px-1 py-0.5 rounded-sm font-semibold"
              style={{
                background:
                  seg.token.kind === "good"
                    ? "rgba(255, 221, 12, 0.35)"
                    : "rgba(248, 134, 115, 0.32)",
                color:
                  seg.token.kind === "good"
                    ? "var(--text-light-primary)"
                    : "var(--text-light-primary)",
              }}
            >
              {seg.token.text}
            </mark>
          ),
        )}
      </p>
    </div>
  );
}

type Segment =
  | { kind: "text"; text: string }
  | { kind: "highlight"; token: ProseBlockData["highlights"][number] };

/** Walk the text, slicing on `[[highlight:N]]` placeholders into a
 *  flat list of text / highlight segments. Unknown indices are dropped
 *  so a malformed token doesn't crash the render. */
function splitOnPlaceholders(
  text: string,
  highlights: ProseBlockData["highlights"],
): Segment[] {
  if (highlights.length === 0) return [{ kind: "text", text }];
  const out: Segment[] = [];
  let cursor = 0;
  PLACEHOLDER_RE.lastIndex = 0;
  for (
    let m = PLACEHOLDER_RE.exec(text);
    m != null;
    m = PLACEHOLDER_RE.exec(text)
  ) {
    const idx = Number(m[1]);
    const token = highlights[idx];
    if (m.index > cursor) {
      out.push({ kind: "text", text: text.slice(cursor, m.index) });
    }
    if (token) {
      out.push({ kind: "highlight", token });
    }
    cursor = m.index + m[0].length;
  }
  if (cursor < text.length) {
    out.push({ kind: "text", text: text.slice(cursor) });
  }
  return out;
}
