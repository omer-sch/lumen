import type { ProseBlock as ProseBlockData } from "@/lib/reports/types";
import { cn } from "@/lib/utils";

// Renders one prose block emitted by Smart Reports's composeReport.
// The text carries `[[highlight:N]]` placeholders; each N resolves to
// a ProseBlock.highlights[N] entry that the renderer paints as a
// colored span. Two flavors today:
//   - "good"  yellow background, bold text (positive callout)
//   - "bad"   pink   background, bold text (negative callout)
//
// Phase 3 adds inline `<> AI:` action-item callouts that the
// prose-writer emits when the user pasted action notes that match
// the relevant family. We split those out of the prose into a
// rendered "action" chunk styled as a yellow pill prefix; the
// trailing text reads as plain copy.

type Props = {
  block: ProseBlockData;
  /** Slide-fit variant: tighter padding + smaller fonts so the
   *  paragraph packs into a 16:9 frame. */
  compact?: boolean;
};

const PLACEHOLDER_RE = /\[\[highlight:(\d+)\]\]/g;

export function ProseBlockView({ block, compact }: Props) {
  // Phase 3: split the prose text on `<> AI:` action callouts FIRST.
  // Each callout becomes a separate paragraph rendered with a yellow
  // pill prefix; the surrounding prose flows around them.
  const paragraphs = splitOnActionCallouts(block.text);
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
      {paragraphs.map((para, pIdx) => {
        const segments = splitOnPlaceholders(para.text, block.highlights);
        return (
          <p
            key={pIdx}
            className={cn(
              "font-body leading-relaxed",
              compact ? "text-[12px]" : "text-sm",
              para.kind === "action" && "pl-0",
            )}
            style={{ color: "var(--text-light-secondary)" }}
          >
            {para.kind === "action" ? (
              <span
                className="mr-2 inline-flex items-center rounded-sm px-1.5 py-0.5 align-middle font-bold"
                style={{
                  background: "var(--color-brand, #FFDD0C)",
                  color: "var(--text-light-primary, #0A1428)",
                  fontSize: compact ? "10px" : "11px",
                  letterSpacing: "0.05em",
                  textTransform: "uppercase",
                }}
              >
                {"<> AI"}
              </span>
            ) : null}
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
                    color: "var(--text-light-primary)",
                  }}
                >
                  {seg.token.text}
                </mark>
              ),
            )}
          </p>
        );
      })}
    </div>
  );
}

// Split prose on `<> AI:` callout markers. Each callout becomes a
// separate paragraph entry tagged kind="action"; surrounding text
// becomes kind="prose". Matches the renderer style in the Week 18
// reference deck where action callouts are visually distinct rows
// rather than inline tokens.
type Paragraph = { kind: "prose" | "action"; text: string };
const ACTION_CALLOUT_RE = /<>\s*AI:\s*/g;

function splitOnActionCallouts(input: string): Paragraph[] {
  if (typeof input !== "string" || input.length === 0) {
    return [{ kind: "prose", text: input ?? "" }];
  }
  // The regex eats the literal `<> AI:` token; what remains on each
  // side of a match is the surrounding prose. Anything that comes
  // AFTER a match (up to the next match or end of string) is the
  // action sentence.
  const matches: number[] = [];
  ACTION_CALLOUT_RE.lastIndex = 0;
  for (
    let m = ACTION_CALLOUT_RE.exec(input);
    m != null;
    m = ACTION_CALLOUT_RE.exec(input)
  ) {
    matches.push(m.index + m[0].length);
  }
  if (matches.length === 0) {
    return [{ kind: "prose", text: input }];
  }

  const out: Paragraph[] = [];
  const firstMatchStart = matches[0];
  // The prose chunk that comes BEFORE the first <> AI: marker.
  // Trimmed so a leading newline doesn't produce an empty paragraph.
  // Find the actual `<>` index (the match index minus token length)
  // by scanning back.
  const firstMarkerIdx = input.slice(0, firstMatchStart).lastIndexOf("<>");
  const preProse = input
    .slice(0, firstMarkerIdx >= 0 ? firstMarkerIdx : firstMatchStart)
    .trim();
  if (preProse.length > 0) out.push({ kind: "prose", text: preProse });

  for (let i = 0; i < matches.length; i++) {
    const start = matches[i];
    const nextMarkerIdx =
      i + 1 < matches.length
        ? input.slice(0, matches[i + 1]).lastIndexOf("<>")
        : input.length;
    const action = input.slice(start, nextMarkerIdx).trim();
    if (action.length > 0) out.push({ kind: "action", text: action });
  }

  return out;
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
