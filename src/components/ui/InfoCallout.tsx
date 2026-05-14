"use client";

import { useEffect, useState } from "react";
import { Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type InfoCalloutProps = {
  /** Short single-sentence title (sets the tone — neutral, not alarming). */
  title: string;
  /** Body line; multi-sentence is fine. Kept terse so it reads at a glance. */
  body: string;
  /**
   * Optional storage key. When provided, the user can dismiss the callout
   * and the dismissed state persists across sessions for that key. Omit
   * for callouts that should always be visible (compliance, etc.).
   */
  dismissKey?: string;
  className?: string;
  /** Testid for e2e + snapshot tests. */
  "data-testid"?: string;
};

/**
 * Informational callout for data-quality caveats. Soft yellow tint on
 * dark surfaces; never red. The information conveyed should *build*
 * trust, not erode it — the user already knows about the issue and the
 * callout confirms the tool is being honest about it.
 *
 * Design tokens used:
 *   --color-yellow            (info accent, on dark)
 *   --tint-yellow-soft        (background tint)
 *   --text-secondary          (body)
 *   --text-primary            (title)
 *   --border-subtle           (outline when no tint accent)
 */
export function InfoCallout({
  title,
  body,
  dismissKey,
  className,
  "data-testid": testId,
}: InfoCalloutProps) {
  const [dismissed, setDismissed] = useState(false);
  // Hydrate the dismissed state from localStorage so the callout stays
  // hidden after a hard refresh. Reads happen client-side only.
  useEffect(() => {
    if (!dismissKey || typeof window === "undefined") return;
    try {
      if (window.localStorage.getItem(dismissKey) === "1") setDismissed(true);
    } catch {
      // localStorage can throw in private-browsing / sandboxed iframes —
      // the callout just stays visible, which is the safer default.
    }
  }, [dismissKey]);

  if (dismissed) return null;

  const dismiss = () => {
    if (dismissKey) {
      try {
        window.localStorage.setItem(dismissKey, "1");
      } catch {
        /* see above */
      }
    }
    setDismissed(true);
  };

  return (
    <div
      role="note"
      data-testid={testId}
      className={cn(
        "flex items-start gap-3 rounded-md px-3.5 py-3 font-body text-xs leading-relaxed",
        className,
      )}
      style={{
        background: "var(--tint-yellow-soft)",
        border:
          "1px solid color-mix(in oklab, var(--color-yellow) 28%, transparent)",
        color: "var(--text-secondary)",
      }}
    >
      <span
        aria-hidden="true"
        className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
        style={{
          background: "color-mix(in oklab, var(--color-yellow) 18%, transparent)",
          color: "var(--color-yellow)",
        }}
      >
        <Info className="h-3.5 w-3.5" strokeWidth={2.25} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-cloud-white">{title}</p>
        <p className="mt-0.5">{body}</p>
      </div>
      {dismissKey && (
        <button
          type="button"
          aria-label="Dismiss notice"
          data-testid={testId ? `${testId}-dismiss` : undefined}
          onClick={dismiss}
          className="ml-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-[color:var(--text-muted)] transition-colors hover:bg-[color:var(--surface-hover)] hover:text-cloud-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow focus-visible:ring-offset-2 focus-visible:ring-offset-navy"
        >
          <X className="h-3.5 w-3.5" strokeWidth={2.25} />
        </button>
      )}
    </div>
  );
}
