"use client";

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type DashboardMode = "my" | "ai";

/**
 * The dashboard's "My / AI" toggle. AI Mode is a real navigation state
 * (`?mode=ai`) — not a local toggle — so a deep link reproduces the AI view
 * exactly and the user can navigate back to their curated dashboard.
 */
export function useDashboardMode() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const mode: DashboardMode = params.get("mode") === "ai" ? "ai" : "my";

  const setMode = useCallback(
    (next: DashboardMode) => {
      const sp = new URLSearchParams(params.toString());
      if (next === "ai") sp.set("mode", "ai");
      else sp.delete("mode");
      const qs = sp.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  return { mode, setMode };
}
