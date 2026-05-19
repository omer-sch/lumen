"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getClientApiBase } from "@/lib/mock/clients";
import type { OsFilter, PlatformFilter } from "@/lib/filters/types";
import type { GeoRow } from "@/lib/globalcomix-queries";

type Args = {
  from: Date;
  to: Date;
  client: string;
  os: OsFilter;
  platforms: PlatformFilter[];
};

type State = {
  /** Rows in the active window. `null` until the first fetch resolves —
   *  the view renders the skeleton in that state. */
  rows: GeoRow[] | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
};

const toISODate = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Drives the Geo Breakdown data layer. Same query-param contract as
 * `useCreativeBreakdown` / `useCampaignsData` so cache keys stay
 * aligned across the dashboard. Calls the existing `/api/bq/geo`
 * endpoint (not `/api/bq/campaigns/geo` — Lumen's convention is
 * `/api/bq/<resource>`).
 *
 * Phase 1 shape: `queryGlobalComixGeo` returns cohort-side metrics
 * only (sub_paid, sub_organic, sub_d7, rev_d7). Cost-side fields
 * arrive zero-filled until the per-country spend join lands; the
 * view surfaces an InfoCallout to flag the gap.
 */
export function useGeoData({
  from,
  to,
  client,
  os,
  platforms,
}: Args): State {
  const fromIso = toISODate(from);
  const toIso = toISODate(to);
  const platformsKey = platforms.join(",");

  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState<State>({
    rows: null,
    loading: true,
    error: null,
    refetch: () => undefined,
  });

  const abortRef = useRef<AbortController | null>(null);
  const refetch = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    abortRef.current?.abort();

    setState((cur) => ({
      ...cur,
      loading: true,
      error: null,
      refetch,
    }));

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const qs = new URLSearchParams({ client, from: fromIso, to: toIso });
    if (os !== "total") qs.set("os", os);
    if (platforms.length > 0) qs.set("platforms", platforms.join(","));

    const apiBase = getClientApiBase(client);
    const url = `${apiBase}/geo?${qs}`;

    fetch(url, { signal: ctrl.signal, cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`${url} → ${res.status}`);
        const rows = (await res.json()) as GeoRow[];
        if (ctrl.signal.aborted) return;
        setState({ rows, loading: false, error: null, refetch });
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        const message = err instanceof Error ? err.message : "Unknown error";
        setState((cur) => ({
          rows: cur.rows,
          loading: false,
          error: message,
          refetch,
        }));
      });

    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, fromIso, toIso, os, platformsKey, nonce, refetch]);

  return state;
}
