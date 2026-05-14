"use client";

import { useEffect, useRef } from "react";
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

  // Hover/focus tints differ per surface. On light report cards we lean
  // on the standard surface-hover token; on the dark navy cover we use a
  // translucent white wash so the affordance is visible without blowing
  // out the gradient.
  const toneClasses =
    tone === "dark"
      ? "focus:bg-white/10 focus:ring-2 focus:ring-ua/40 hover:bg-white/10"
      : "focus:bg-[color:var(--surface-hover)] focus:ring-2 focus:ring-ua/40 hover:bg-[color:var(--surface-hover)]";

  return (
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
        "rounded px-1 -mx-1 transition-colors duration-280 ease-out-quart outline-none",
        toneClasses,
        className,
      )}
    />
  );
}
