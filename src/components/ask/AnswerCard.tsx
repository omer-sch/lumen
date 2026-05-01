"use client";

import { Pin, PinOff, Sparkles } from "lucide-react";
import { GlassCard } from "@/components/ui/GlassCard";
import { PinnedRenderer } from "./visualizations/Pinned";
import type { Answer } from "@/lib/ask/types";

type AnswerCardProps = {
  answer: Answer;
  /** When set, the card shows a Pin button. */
  onPin?: () => void;
  /** When set, the card is itself a pinned tile and this unpins it. */
  onUnpin?: () => void;
  /** Override the eyebrow label — used by PinnedSection for "Pinned · X ago". */
  pinnedLabel?: string;
  /** "lg" = full result panel; "md" = compact (used by Pinned section). */
  size?: "md" | "lg";
};

export function AnswerCard({
  answer,
  onPin,
  onUnpin,
  pinnedLabel,
  size = "lg",
}: AnswerCardProps) {
  return (
    <GlassCard
      glow="ua"
      enterIndex={1}
      className="flex flex-col gap-5 p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            aria-hidden
            className="grid h-8 w-8 shrink-0 place-items-center rounded-md"
            style={{
              background: "var(--tint-ua-soft)",
              color: "var(--color-ua)",
              boxShadow: "0 0 14px color-mix(in oklab, var(--color-ua) 35%, transparent)",
            }}
          >
            <Sparkles className="h-4 w-4" strokeWidth={2.25} />
          </span>
          <div className="min-w-0">
            <p className="font-body text-xs uppercase tracking-wider text-[color:var(--text-muted)]">
              {pinnedLabel ?? "Lumen says"}
            </p>
            <p
              className={
                size === "lg"
                  ? "font-display text-md font-bold leading-snug text-cloud-white sm:text-lg"
                  : "font-display text-sm font-bold leading-snug text-cloud-white"
              }
            >
              {answer.narration}
            </p>
            <p className="mt-1 font-body text-xs italic text-[color:var(--text-muted)]">
              &ldquo;{answer.question}&rdquo;
            </p>
          </div>
        </div>
        {(onPin || onUnpin) && (
          <button
            type="button"
            onClick={onUnpin ?? onPin}
            aria-label={onUnpin ? "Unpin from dashboard" : "Pin to dashboard"}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[color:var(--text-muted)] transition-[transform,background-color,color] duration-280 ease-out-quart hover:-translate-y-px hover:bg-[color:var(--surface-hover)] hover:text-cloud-white active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ua focus-visible:ring-offset-2 focus-visible:ring-offset-navy"
          >
            {onUnpin ? (
              <PinOff className="h-4 w-4" strokeWidth={2} />
            ) : (
              <Pin className="h-4 w-4" strokeWidth={2} />
            )}
          </button>
        )}
      </div>

      <PinnedRenderer config={answer.config} size={size} />

      {(answer.rationale || answer.alternative) && size === "lg" && (
        <div className="flex flex-col gap-2 rounded-md p-3" style={{ background: "var(--surface-hover)" }}>
          <p className="text-xs text-[color:var(--text-secondary)]">
            <span className="font-semibold uppercase tracking-wider text-[color:var(--text-muted)]">
              Why this view ·{" "}
            </span>
            {answer.rationale}
          </p>
          {answer.alternative && (
            <p className="text-xs text-[color:var(--text-muted)]">
              <span className="font-semibold uppercase tracking-wider">
                Try instead ·{" "}
              </span>
              {answer.alternative.reason}
            </p>
          )}
        </div>
      )}
    </GlassCard>
  );
}
