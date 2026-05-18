"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getClientApiBase } from "@/lib/mock/clients";
import type { OsFilter, PlatformFilter } from "@/lib/filters/types";
import type { TopAdTrendResponse } from "@/lib/globalcomix-queries";

type Args = {
  from: Date;
  to: Date;
  client: string;
  os: OsFilter;
  platforms: PlatformFilter[];
};

type State = {
  data: TopAdTrendResponse | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
};

const toISODate = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Drives the Top Ad trend chart at the top of the Creative Breakdown
 * view. Same fetch / filter shape as `useCreativeBreakdown`; lives
 * under its own hook because the chart re-renders independently of
 * the per-ad table (filter chips don't trigger a re-fetch here either).
 */
export function useTopAdTrend({
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
    data: null,
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
    const url = `${apiBase}/creatives/top-ad-trend?${qs}`;

    fetch(url, { signal: ctrl.signal, cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`${url} → ${res.status}`);
        const data = (await res.json()) as TopAdTrendResponse;
        if (ctrl.signal.aborted) return;
        setState({ data, loading: false, error: null, refetch });
      })
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        const message = err instanceof Error ? err.message : "Unknown error";
        setState((cur) => ({
          data: cur.data,
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
