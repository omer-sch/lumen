"use client";

import { useEffect, useState } from "react";
import type { FreshnessData } from "@/types/dashboard";

/**
 * Fetches the Rivery freshness telemetry for the active client.
 *
 * Returned shape mirrors the `/api/bq/freshness` payload so callers can
 * choose how to surface it:
 *   - `state.hoursAgo` — operational signal (did the loader stall?)
 *   - `state.dataAsOf` — data currency (when does the series end?)
 *   - `state.lastUpdated` — ISO timestamp of the most recent run
 *
 * `errored` flips on when the request fails for any reason; consumers
 * render an em-dash / "unavailable" affordance in that case so the
 * dashboard doesn't pretend it knows the truth.
 */
export function useFreshness(client: string): {
  state: FreshnessData | null;
  errored: boolean;
} {
  const [state, setState] = useState<FreshnessData | null>(null);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    const ctrl = new AbortController();
    setState(null);
    setErrored(false);
    const qs = new URLSearchParams({ client });
    fetch(`/api/bq/freshness?${qs.toString()}`, {
      signal: ctrl.signal,
      cache: "no-store",
    })
      .then((r) =>
        r.ok ? r.json() : Promise.reject(new Error(`${r.status}`)),
      )
      .then((d: FreshnessData) => setState(d))
      .catch((err: unknown) => {
        if ((err as Error)?.name === "AbortError") return;
        setErrored(true);
      });
    return () => ctrl.abort();
  }, [client]);

  return { state, errored };
}
