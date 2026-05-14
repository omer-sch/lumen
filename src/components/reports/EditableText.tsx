"use client";

import { useEffect, useRef } from "react";
import { Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

type EditableTextProps = {
  value: string;
  onChange: (next: string) => void;
  multiline?: boolean;
  className?: string;
  ariaLabel?: string;
  /** Picks hover/focus tint that matches the underlying surface.
   *  "light" = light report card (default). "dark" = navy cover gradient. */
  tone?: "light" | "dark";
};

/**
 * contentEditable wrapper — keeps the source-of-truth in React state but
 * doesn't re-render the DOM mid-edit, which would lose the user's caret.
 * The value is only pushed back into the DOM when it diverges externally
 * (e.g. when a different report is loaded).
 *
 * Affordances: hovering surfaces a dotted underline + a small pencil
 * glyph at the top-right of the field; focus strengthens to a full mint
 * ring + a 1px inset mint border, so the "I am editing" state reads as
 * a real input.
 */
export function EditableText({
  value,
  onChange,
  multiline = false,
  className,
  ariaLabel,
  tone = "light",
}: EditableTextProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.innerText !== value) {
      el.innerText = value;
    }
  }, [value]);

  // Tones drive the hover affordance + focus ring color. Light sits on
  // the report card; dark sits on the carousel cover's navy gradient.
  // `decoration-dotted` requires Tailwind ≥ 3.3, which the project is on.
  const toneClasses =
    tone === "dark"
      ? "hover:bg-white/10 hover:decoration-[rgba(250,250,250,0.5)] focus:bg-white/10"
      : "hover:bg-[color:var(--surface-hover)] hover:decoration-[rgba(10,20,40,0.5)] focus:bg-[color:var(--surface-hover)]";

  return (
    <div className="group relative">
      <div
        ref={ref}
        role="textbox"
        aria-label={ariaLabel}
        aria-multiline={multiline}
        contentEditable
        suppressContentEditableWarning
        onInput={(e) => onChange((e.currentTarget as HTMLDivElement).innerText)}
        onKeyDown={(e) => {
          if (!multiline && e.key === "Enter") {
            e.preventDefault();
            (e.currentTarget as HTMLDivElement).blur();
          }
        }}
        className={cn(
          "rounded px-1 -mx-1 cursor-text outline-none transition-[background-color,box-shadow,text-decoration-color] duration-280 ease-out-quart",
          "hover:underline hover:decoration-dotted hover:underline-offset-4",
          "focus:[box-shadow:0_0_0_2px_var(--color-ua),inset_0_0_0_1px_var(--color-ua)]",
          toneClasses,
          className,
        )}
      />
      <Pencil
        aria-hidden
        strokeWidth={2}
        className={cn(
          "pointer-events-none absolute right-0 top-0.5 h-2.5 w-2.5 opacity-0 transition-opacity duration-280 ease-out-quart group-hover:opacity-60",
          tone === "dark"
            ? "text-[color:rgba(255,255,255,0.7)]"
            : "text-[color:var(--text-light-muted)]",
        )}
      />
    </div>
  );
}
