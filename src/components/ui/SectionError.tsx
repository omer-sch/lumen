"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

type SectionErrorProps = {
  /** Display name of the section (e.g. "the KPI tiles", "the trend chart").
   *  Goes straight into the body copy, so write it the way you'd read it
   *  aloud: "Could not load {section}. Try refreshing." */
  section: string;
  /** Approximate height of the failed slot so the layout doesn't collapse.
   *  Use a class string like "h-44" or "min-h-[14rem]". */
  shape?: string;
  /** Optional retry handler. Renders a "Refresh" button when provided. */
  onRetry?: () => void;
  className?: string;
  "data-testid"?: string;
};

/**
 * Per-section error placeholder. Sized to match the failed slot's shape
 * so a single failing fetch doesn't collapse the layout. Copy is muted
 * and non-alarming — the user already knows something went wrong; this
 * just tells them which thing and what to do about it.
 *
 * Used in place of the failed section's normal content; the rest of the
 * dashboard stays rendered.
 */
export function SectionError({
  section,
  shape = "min-h-[10rem]",
  onRetry,
  className,
  "data-testid": testId,
}: SectionErrorProps) {
  return (
    <div
      role="alert"
      data-testid={testId ?? "section-error"}
      className={cn(
        "flex flex-col items-start justify-center gap-3 rounded-lg p-5 font-body text-sm",
        shape,
        className,
      )}
      style={{
        background: "var(--surface-glass)",
        border: "1px dashed var(--border-default)",
        color: "var(--text-secondary)",
        WebkitBackdropFilter: "var(--blur-glass)",
        backdropFilter: "var(--blur-glass)",
      }}
    >
      <div className="flex items-center gap-2 text-[color:var(--text-muted)]">
        <AlertTriangle
          className="h-4 w-4 text-[color:var(--color-yellow)]"
          strokeWidth={2}
        />
        <span className="font-body text-xs font-semibold uppercase tracking-wider">
          Section unavailable
        </span>
      </div>
      <p className="leading-relaxed">
        Could not load {section}. Try refreshing.
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          data-testid={testId ? `${testId}-retry` : "section-error-retry"}
          className="inline-flex items-center gap-1.5 rounded-sm px-2.5 py-1 font-body text-xs font-semibold uppercase tracking-wider text-ua transition-colors hover:bg-[color:var(--color-ua-dim)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ua focus-visible:ring-offset-2 focus-visible:ring-offset-navy"
          style={{
            border:
              "1px solid color-mix(in oklab, var(--color-ua) 30%, transparent)",
          }}
        >
          <RefreshCw className="h-3 w-3" strokeWidth={2.25} />
          Retry
        </button>
      )}
    </div>
  );
}
