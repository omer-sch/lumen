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

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        aria-live="polite"
        aria-label={
          busy
            ? `Regenerating ${slideTarget.replace("_", " ")} section`
            : `Regenerate ${slideTarget.replace("_", " ")} section`
        }
        className={cn(
          "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-body text-[11px] font-semibold uppercase tracking-wider transition-[transform,box-shadow,opacity] duration-280 ease-out-quart",
          "border border-[color:var(--color-ua)]/40 text-[color:var(--color-ua)]",
          "hover:-translate-y-px hover:bg-[color:var(--tint-ua-soft)]",
          "disabled:cursor-not-allowed disabled:opacity-60",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-ua)] focus-visible:ring-offset-2 focus-visible:ring-offset-navy",
        )}
      >
        <RefreshCw
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
