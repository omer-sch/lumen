import type { ReactNode } from "react";
import { GlassBulb } from "./GlassBulb";

type EmptyStateProps = {
  title: string;
  description?: string;
  /** Optional CTA / action button rendered under the description. */
  action?: ReactNode;
  /** Bulb size in px. Defaults to 140. */
  bulbSize?: number;
  /** Bulb accent. Defaults to mint (UA workspace). */
  accent?: "mint" | "yellow" | "warm";
};

/**
 * The yellowHEAD brand-correct empty state. The glass light bulb is the
 * primary brand icon — use it whenever a surface has no content yet, no
 * results, or is awaiting first input. Never use a generic icon or a
 * "no data" SVG.
 */
export function EmptyState({
  title,
  description,
  action,
  bulbSize = 140,
  accent = "mint",
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-5 px-6 py-12 text-center">
      <GlassBulb size={bulbSize} accent={accent} />
      <div className="flex max-w-md flex-col gap-2">
        <h3 className="font-display text-md font-bold leading-snug text-cloud-white">
          {title}
        </h3>
        {description && (
          <p className="font-body text-sm leading-relaxed text-[color:var(--text-secondary)]">
            {description}
          </p>
        )}
      </div>
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}

type ErrorStateProps = {
  title?: string;
  description?: string;
  /** Optional action — typically a "Try again" button. */
  action?: ReactNode;
};

/**
 * Inline error surface using the brand's coral danger tint. Direct copy,
 * no "oops" language. Brand-correct alternative to a window.alert.
 */
export function ErrorState({
  title = "Something went sideways",
  description = "We couldn't load this section. Try again, or check back in a minute.",
  action,
}: ErrorStateProps) {
  return (
    <div
      className="flex flex-col items-start gap-3 rounded-lg p-5"
      style={{
        background: "var(--tint-danger-soft)",
        border: "1px solid color-mix(in oklab, var(--color-creative) 30%, transparent)",
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)",
      }}
    >
      <p className="font-display text-md font-bold leading-snug text-[color:var(--color-creative)]">
        {title}
      </p>
      <p className="font-body text-sm leading-relaxed text-[color:var(--text-secondary)]">
        {description}
      </p>
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}
