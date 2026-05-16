"use client";

import { cn } from "@/lib/utils";

// "What did you do this week?" textarea. Plain-text input the user
// pastes their week's actions into; the server forwards the raw
// string to composeReport.options.actionNotes where Smart Reports
// parses it into structured items and the prose-writer weaves each
// matching item into the relevant family's paragraph as a
// `<> AI:` callout.
//
// Why a textarea and not a structured form
// ----------------------------------------
// The analysts who'll use this paste free-form notes from a shared
// doc or a Slack message; asking them to fill seven structured
// fields turns a 10-second action into a 90-second one. The parsing
// happens server-side in action-items.ts and is forgiving (bullet
// markers, blank lines, mixed-case all flow through). If a line
// can't be classified to a family it lands as "Other / Unclassified"
// and the prose-writer falls back to surfacing it in a catch-all
// paragraph.

type Props = {
  value: string;
  onChange: (next: string) => void;
  /** When true, the textarea reads as a muted hint with a "(optional)"
   *  badge. The manual builder uses this; Hermes paste-email modal
   *  may render it differently. */
  hint?: string;
  /** Disable input (e.g. while a report is generating). */
  disabled?: boolean;
  className?: string;
  /** Hide the label band. Useful when the parent already renders a
   *  section header above this control. */
  hideLabel?: boolean;
};

const PLACEHOLDER = [
  "We paused the WW Sub Seasonal Invincible campaign last week.",
  "Added fresh creatives to the Archetype ad groups on TikTok.",
  "Excluded low-performing geos on the Meta WW SubStart Evergreen.",
].join("\n");

export function ActionItemsInput({
  value,
  onChange,
  hint,
  disabled,
  className,
  hideLabel,
}: Props) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      {!hideLabel ? (
        <div className="flex items-baseline justify-between">
          <label
            htmlFor="action-items-input"
            className="font-body text-sm font-medium"
            style={{ color: "var(--text-primary)" }}
          >
            What did you do this week?
          </label>
          <span
            className="font-body text-xs"
            style={{ color: "var(--text-muted)" }}
          >
            optional
          </span>
        </div>
      ) : null}
      {hint ? (
        <div
          className="font-body text-xs leading-relaxed"
          style={{ color: "var(--text-muted)" }}
        >
          {hint}
        </div>
      ) : null}
      <textarea
        id="action-items-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        placeholder={PLACEHOLDER}
        rows={4}
        className={cn(
          "w-full resize-y rounded-lg border bg-transparent px-3 py-2",
          "font-body text-sm leading-relaxed",
          "focus:outline-none focus:ring-2",
          disabled && "opacity-60 cursor-not-allowed",
        )}
        style={{
          borderColor: "var(--border-default)",
          color: "var(--text-primary)",
        }}
      />
    </div>
  );
}
