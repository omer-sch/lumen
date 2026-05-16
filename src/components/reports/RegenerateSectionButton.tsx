"use client";

import { useCallback, useState } from "react";
import { RefreshCw } from "lucide-react";

import { cn } from "@/lib/utils";

type Target = "platform_overall" | "channel_weekly" | "campaign_breakdown";

type Props = {
  reportId: string;
  originalRunId: string;
  slideTarget: Target;
  /** Fired after the server-side regenerate writes the new bullets so
   *  the parent can refetch the report and update local state. */
  onRegenerated: () => void;
};

// Small "regenerate this section" affordance shown on Hermes-drafted
// reports next to each section header. Posts to
// /api/agents/hermes/regenerate-section and lets the parent know when
// the new bullets have landed.
export function RegenerateSectionButton({
  reportId,
  originalRunId,
  slideTarget,
  onRegenerated,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClick = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/agents/hermes/regenerate-section", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          report_id: reportId,
          slide_target: slideTarget,
          original_run_id: originalRunId,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      onRegenerated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Regenerate failed");
    } finally {
      setBusy(false);
    }
  }, [busy, onRegenerated, originalRunId, reportId, slideTarget]);

  // Accessibility note: the button sits on the white report card
  // (--surface-light-card), not on the navy dashboard. Earlier draft
  // used mint text on white which read at 1.6:1 contrast, failing AA.
  // Filled-mint with navy text (the brand's primary action shape from
  // tailwind.config.ts) lands at >= 7:1. Focus ring offset is the
  // light card surface so the ring is visible on the actual backdrop.
  const label = `Regenerate ${slideTarget.replaceAll("_", " ")} section`;
  return (
    <div className="flex flex-col items-end gap-1" aria-live="polite">
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        aria-busy={busy}
        aria-label={busy ? `${label} (in progress)` : label}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-body text-[11px] font-semibold uppercase tracking-wider transition-[transform,box-shadow,opacity] duration-280 ease-out-quart",
          "bg-[color:var(--color-ua)] text-navy shadow-mint",
          "hover:-translate-y-px active:scale-[0.97]",
          "disabled:cursor-not-allowed disabled:opacity-70",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-ua)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--surface-light-card)]",
        )}
      >
        <RefreshCw
          aria-hidden
          className={cn("h-3 w-3", busy && "animate-spin")}
          strokeWidth={2.25}
        />
        {busy ? "Regenerating" : "Regenerate"}
      </button>
      {error && (
        <p
          role="alert"
          className="font-body text-[11px] text-[color:var(--color-creative)]"
        >
          {error}
        </p>
      )}
    </div>
  );
}
