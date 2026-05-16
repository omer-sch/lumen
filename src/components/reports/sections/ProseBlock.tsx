import type {
  HighlightKind,
  ProseBlock as ProseBlockData,
  ProseBullet,
} from "@/lib/reports/types";
import { cn } from "@/lib/utils";
import { CALLOUT_HIGHLIGHT_RGBA } from "./callout";
import { EditableText } from "../EditableText";

// Renders one Smart Reports prose block as:
//   - optional family / channel heading
//   - 2 to 4 bullets, each with a small accent square + inline
//     highlight runs ({{good}}/{{bad}} + the pink/orange/blue/green/
//     violet callout-color tokens)
//   - optional `<> AI:` action-item pill
//   - bold "Bottom line" band (yellow background, navy text)
//
// In editable mode the bullet text, action item, and bottom line each
// become inline editors. The parent owns the prose data: every edit
// fires `onChange` with the patched ProseBlock so the caller can
// thread it through the section -> report -> save chain.

type Props = {
  block: ProseBlockData;
  /** Slide-fit variant: tighter padding + smaller fonts so the block
   *  packs into the carousel's 16:9 frame. */
  compact?: boolean;
  /** When true, bullets / actionItem / bottomLine become inline
   *  EditableText fields. Highlights are not editable -- a user who
   *  wants different highlights regenerates the block. */
  editable?: boolean;
  /** Fires with the patched block whenever the user edits a bullet,
   *  the action item, or the bottom line. */
  onChange?: (next: ProseBlockData) => void;
};

const PLACEHOLDER_RE = /\[\[highlight:(\d+)\]\]/g;

export function ProseBlockView({ block, compact, editable, onChange }: Props) {
  const setBulletText = (idx: number, nextText: string) => {
    if (!onChange) return;
    onChange({
      ...block,
      bullets: block.bullets.map((b, i) =>
        i === idx ? { ...b, text: nextText } : b,
      ),
    });
  };
  const setActionItem = (next: string) => {
    if (!onChange) return;
    onChange({ ...block, actionItem: next });
  };
  const setBottomLine = (next: string) => {
    if (!onChange) return;
    onChange({ ...block, bottomLine: next });
  };

  return (
    <div className={cn("flex flex-col", compact ? "gap-2" : "gap-3")}>
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

      <ul className={cn("flex flex-col", compact ? "gap-1.5" : "gap-2")}>
        {block.bullets.map((bullet, i) => (
          <BulletRow
            key={i}
            bullet={bullet}
            compact={compact}
            editable={editable}
            onChange={(nextText) => setBulletText(i, nextText)}
          />
        ))}
      </ul>

      {(block.actionItem || editable) && (
        <div
          className={cn(
            "flex flex-wrap items-start",
            compact ? "gap-1.5" : "gap-2",
          )}
        >
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
            {"<>"} AI
          </span>
          {editable ? (
            <EditableText
              value={block.actionItem ?? ""}
              onChange={setActionItem}
              multiline
              ariaLabel="Action item"
              className={cn(
                "flex-1 font-body leading-relaxed text-[color:var(--text-light-primary)] min-h-[1.5rem]",
                compact ? "text-[11.5px]" : "text-[13px]",
              )}
            />
          ) : block.actionItem ? (
            <p
              className={cn(
                "flex-1 font-body leading-relaxed text-[color:var(--text-light-primary)]",
                compact ? "text-[11.5px]" : "text-[13px]",
              )}
            >
              {block.actionItem}
            </p>
          ) : null}
        </div>
      )}

      {(block.bottomLine || editable) && (
        <div
          className={cn(
            "rounded-md font-body font-bold leading-snug",
            compact ? "px-3 py-2 text-[12px]" : "px-4 py-2.5 text-[13.5px]",
          )}
          style={{
            background: "var(--color-yellow)",
            color: "var(--color-navy)",
          }}
        >
          <span
            className={cn(
              "mr-2 font-display uppercase tracking-[0.1em]",
              compact ? "text-[9px]" : "text-[10px]",
            )}
            style={{ opacity: 0.7 }}
          >
            Bottom line
          </span>
          {editable ? (
            <EditableText
              value={block.bottomLine}
              onChange={setBottomLine}
              ariaLabel="Bottom line"
              className="font-body font-bold text-[color:var(--color-navy)]"
            />
          ) : (
            <span>{block.bottomLine}</span>
          )}
        </div>
      )}
    </div>
  );
}

function BulletRow({
  bullet,
  compact,
  editable,
  onChange,
}: {
  bullet: ProseBullet;
  compact?: boolean;
  editable?: boolean;
  onChange?: (nextText: string) => void;
}) {
  return (
    <li className="flex gap-2.5">
      <span
        aria-hidden
        className={cn(
          "mt-[0.45rem] shrink-0 rounded-sm",
          compact ? "h-1.5 w-1.5" : "h-2 w-2",
        )}
        style={{ background: "var(--color-ua)" }}
      />
      {editable ? (
        <EditableText
          value={reconstructBulletPlainText(bullet)}
          onChange={(next) => onChange?.(next)}
          multiline
          ariaLabel="Bullet"
          className={cn(
            "flex-1 font-body leading-relaxed text-[color:var(--text-light-primary)] min-h-[1.25rem]",
            compact ? "text-[12px]" : "text-[13.5px]",
          )}
        />
      ) : (
        <BulletText bullet={bullet} compact={compact} />
      )}
    </li>
  );
}

function BulletText({
  bullet,
  compact,
}: {
  bullet: ProseBullet;
  compact?: boolean;
}) {
  const segments = splitOnPlaceholders(bullet.text, bullet.highlights);
  return (
    <p
      className={cn(
        "font-body leading-relaxed",
        compact ? "text-[12px]" : "text-[13.5px]",
      )}
      style={{ color: "var(--text-light-primary)" }}
    >
      {segments.map((seg, i) =>
        seg.kind === "text" ? (
          <span key={i}>{seg.text}</span>
        ) : (
          <mark
            key={i}
            className="rounded-sm px-1 py-0.5 font-semibold"
            style={{
              background: highlightBackground(seg.kind),
              color: "var(--text-light-primary)",
            }}
          >
            {seg.text}
          </mark>
        ),
      )}
    </p>
  );
}

/** Flatten a bullet (text + tokens) back into plain text for editing.
 *  We lose the highlight metadata when the user edits; that is the
 *  expected trade-off, the user can regenerate to get fresh
 *  highlights. */
function reconstructBulletPlainText(bullet: ProseBullet): string {
  if (bullet.highlights.length === 0) return bullet.text;
  return bullet.text.replace(PLACEHOLDER_RE, (_full, idxStr) => {
    const idx = Number(idxStr);
    const token = bullet.highlights[idx];
    return token ? token.text : "";
  });
}

function highlightBackground(kind: HighlightKind): string {
  switch (kind) {
    case "good":
      return "rgba(255, 221, 12, 0.35)";
    case "bad":
      return "rgba(248, 134, 115, 0.32)";
    case "pink":
      return CALLOUT_HIGHLIGHT_RGBA.pink;
    case "orange":
      return CALLOUT_HIGHLIGHT_RGBA.orange;
    case "blue":
      return CALLOUT_HIGHLIGHT_RGBA.blue;
    case "green":
      return CALLOUT_HIGHLIGHT_RGBA.green;
    case "violet":
      return CALLOUT_HIGHLIGHT_RGBA.violet;
  }
}

type Segment =
  | { kind: "text"; text: string }
  | { kind: HighlightKind; text: string };

function splitOnPlaceholders(
  text: string,
  highlights: ProseBullet["highlights"],
): Segment[] {
  if (highlights.length === 0) return [{ kind: "text", text }];
  const out: Segment[] = [];
  let cursor = 0;
  const re = new RegExp(PLACEHOLDER_RE.source, "g");
  for (let m = re.exec(text); m != null; m = re.exec(text)) {
    const idx = Number(m[1]);
    const token = highlights[idx];
    if (m.index > cursor) {
      out.push({ kind: "text", text: text.slice(cursor, m.index) });
    }
    if (token) {
      out.push({ kind: token.kind, text: token.text });
    }
    cursor = m.index + m[0].length;
  }
  if (cursor < text.length) {
    out.push({ kind: "text", text: text.slice(cursor) });
  }
  return out;
}

/** Public helper for callers (Copy button) that want the plain-text
 *  rendering of a block. */
export function proseBlockToPlainText(block: ProseBlockData): string {
  const lines: string[] = [];
  if (block.heading) lines.push(block.heading);
  for (const b of block.bullets) {
    lines.push(`- ${reconstructBulletPlainText(b)}`);
  }
  if (block.actionItem) lines.push(`<> AI: ${block.actionItem}`);
  if (block.bottomLine) lines.push(`Bottom line: ${block.bottomLine}`);
  return lines.join("\n");
}
