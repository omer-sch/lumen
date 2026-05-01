"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

type EditableTextProps = {
  value: string;
  onChange: (next: string) => void;
  multiline?: boolean;
  className?: string;
  ariaLabel?: string;
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
}: EditableTextProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.innerText !== value) {
      el.innerText = value;
    }
  }, [value]);

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
        "rounded px-1 -mx-1 transition-colors duration-280 ease-out-quart",
        "outline-none focus:bg-[color:var(--surface-hover)] focus:ring-2 focus:ring-ua/40",
        "hover:bg-[color:var(--surface-hover)]",
        className,
      )}
    />
  );
}
