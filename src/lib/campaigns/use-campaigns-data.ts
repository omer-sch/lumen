"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getClientApiBase } from "@/lib/mock/clients";
import type { OsFilter, PlatformFilter } from "@/lib/filters/types";
import type { CampaignRow } from "@/types/dashboard";

type Args = {
  from: Date;
  to: Date;
  client: string;
  /** OS filter from `useGlobalFilters`. "total" omits the param so the
   *  cache shape matches pre-filter-wiring entries on a fresh load. */
  os: OsFilter;
  /** Platform filter from `useGlobalFilters`. Empty array omits the param
   *  for the same cache-continuity reason. */
  platforms: PlatformFilter[];
};

type State = {
  /** Rows in the active window. `null` until the first fetch resolves;
   *  the table renders a `CampaignsTableSkeleton` while this is null. */
  rows: CampaignRow[] | null;
  loading: boolean;
  /** Top-level error string. `null` when the fetch succeeded or is in
   *  flight. The view renders a `SectionError` with a Retry button when
   *  this is set. */
  error: string | null;
  /** Bump the fetch to retry. Used by SectionError's Retry button. */
  refetch: () => void;
};

const toISODate = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Drives the `/campaigns` index data layer. Same query-param contract as
 * `useDashboardData` so the BQ-side cache keys stay aligned across the
 * dashboard and the campaigns page; OS / Platform / Date / Client all
 * flow through identically.
 *
 * Per-section error model isn't needed here — the campaigns page has
 * only the one table — so this returns a single `error` string instead
 * of the `SectionErrors` map the dashboard hook uses.
 */
export function useCampaignsData({
  from,
  to,
  client,
  os,
  platforms,
}: Args): State {
  const fromIso = toISODate(from);
  const toIso = toISODate(to);
  // Stable identity for the platforms array — refetch only when actual
  // values change, not on every render that builds a new array reference.
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
      // Keep `rows` so the table doesn't flash blank between filter
      // changes — the skeleton only mounts on first load.
      loading: true,
      error: null,
      refetch,
    }));

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const qs = new URLSearchParams({ client, from: fromIso, to: toIso });
    // Only non-default values land on the URL so cache entries from
    // before the filter spine still hit on the first post-deploy load.
    if (os !== "total") qs.set("os", os);
    if (platforms.length > 0) qs.set("platforms", platforms.join(","));

    const apiBase = getClientApiBase(client);
    const url = `${apiBase}/campaigns?${qs}`;

    fetch(url, { signal: ctrl.signal, cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`${url} → ${res.status}`);
        const rows = (await res.json()) as CampaignRow[];
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
    // `from` / `to` Date objects don't have stable identity — their ISO
    // strings do. `platformsKey` collapses array-reference churn.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, fromIso, toIso, os, platformsKey, nonce, refetch]);

  return state;
}
