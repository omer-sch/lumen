"use client";

import { AlertTriangle } from "lucide-react";

import { GlassCard } from "@/components/ui/GlassCard";
import { cn } from "@/lib/utils";

export type CoverageStatus = "Stale" | "Missing" | "Unverified";

type Props = {
  title: string;
  status: CoverageStatus;
  /** One-line impact statement: what this means for the numbers above. */
  impact: string;
  /** Optional "Stale since YYYY-MM-DD" or similar — surfaced under the title. */
  lastUpdated?: string;
  enterIndex?: number;
  className?: string;
};

/**
 * Single-warning primitive. Amber-toned GlassCard with a status pill,
 * one-line impact, and an "Open question for BI" badge. The card is
 * signage today — no click-through, no action; a follow-up turns each
 * warning into an actionable link (Slack to Gabby, BI ticket, etc.).
 *
 * We use the existing brand yellow (`--color-yellow`) as the amber tone
 * since there's no formalized `--color-warning` token yet. Noted in the
 * PR description as a token to propose in the next yellowhead-brand
 * skill pass.
 */
export function CoverageWarningCard({
  title,
  status,
  impact,
  lastUpdated,
  enterIndex,
  className,
}: Props) {
  return (
    <GlassCard
      glow="yellow"
      enterIndex={enterIndex}
      className={cn("flex flex-col gap-3 p-5", className)}
      data-testid={`attribution-coverage-${slug(title)}`}
      data-status={status.toLowerCase()}
    >
      <header className="flex items-start gap-2">
        <AlertTriangle
          className="h-4 w-4 shrink-0 text-[color:var(--color-yellow)] mt-0.5"
          strokeWidth={2}
          aria-hidden
        />
        <div className="flex min-w-0 flex-col gap-0.5">
          <h3 className="font-display text-sm font-bold leading-tight text-cloud-white">
            {title}
          </h3>
          {lastUpdated && (
            <p className="font-body text-[11px] text-[color:var(--text-muted)]">
              {lastUpdated}
            </p>
          )}
        </div>
      </header>

      <p className="font-body text-xs leading-relaxed text-[color:var(--text-secondary)]">
        {impact}
      </p>

      <footer className="mt-auto flex items-center justify-between gap-2">
        <StatusPill status={status} />
        <span
          className="inline-flex items-center rounded-sm px-2 py-0.5 font-body text-[10px] font-semibold uppercase tracking-wider text-[color:var(--color-yellow)]"
          style={{
            background: "color-mix(in oklab, var(--color-yellow) 12%, transparent)",
            border:
              "1px solid color-mix(in oklab, var(--color-yellow) 30%, transparent)",
          }}
        >
          Open for BI
        </span>
      </footer>
    </GlassCard>
  );
}

function StatusPill({ status }: { status: CoverageStatus }) {
  // All three variants render in the warm yellow band. Subtle variation
  // (background intensity, label only) reads as "different state of the
  // same kind of problem" — without coral, which we reserve for hard
  // failures rather than known-and-pending data gaps.
  const intensity =
    status === "Missing" ? 22 : status === "Stale" ? 16 : 10;
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-body text-[10px] font-semibold uppercase tracking-wider text-[color:var(--color-yellow)]"
      style={{
        background: `color-mix(in oklab, var(--color-yellow) ${intensity}%, transparent)`,
        border:
          "1px solid color-mix(in oklab, var(--color-yellow) 35%, transparent)",
      }}
      data-testid={`coverage-status-${status.toLowerCase()}`}
    >
      <span
        aria-hidden
        className="inline-block h-1.5 w-1.5 rounded-full"
        style={{
          background: "var(--color-yellow)",
          boxShadow: "0 0 6px var(--color-yellow)",
        }}
      />
      {status}
    </span>
  );
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
