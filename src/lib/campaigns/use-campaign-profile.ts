"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getClientApiBase } from "@/lib/mock/clients";
import type { CampaignProfileData } from "@/types/dashboard";

type Args = {
  campaignId: string;
  from: Date;
  to: Date;
  client: string;
};

type State = {
  data: CampaignProfileData | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
};

const toISODate = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Drives the `/campaigns/[id]` profile data layer. Same URL contract
 * as `useCampaignsData` (date + client), but deliberately omits the
 * OS / Platform params: a profile is "everything about one campaign"
 * and narrowing by OS / Platform would be either coherent (no-op) or
 * contradictory (empty result). The TopBar hides those chips on the
 * profile route entirely.
 *
 * Unknown campaign / out-of-window resolves to `data.summary === null`
 * with empty arrays elsewhere — the renderer reads that as "empty
 * state, render the back-link card", never as an error.
 */
export function useCampaignProfile({
  campaignId,
  from,
  to,
  client,
}: Args): State {
  const fromIso = toISODate(from);
  const toIso = toISODate(to);

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
    const apiBase = getClientApiBase(client);
    const url = `${apiBase}/campaigns/${encodeURIComponent(campaignId)}/profile?${qs}`;

    fetch(url, { signal: ctrl.signal, cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(`${url} → ${res.status}`);
        const data = (await res.json()) as CampaignProfileData;
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
  }, [campaignId, client, fromIso, toIso, nonce, refetch]);

  return state;
}
