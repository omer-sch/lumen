"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Report } from "./types";

const STORAGE_KEY = "lumen.reports";
const MAX = 50;
// One-shot drain flag so we never re-drain on subsequent loads if the
// user has emptied their server-side list.
const DRAINED_KEY = "lumen.reports.drained";

const readLocal = (): Report[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Report[]) : [];
  } catch {
    return [];
  }
};

const writeLocal = (items: Report[]) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* quota or disabled */
  }
};

const clearLocal = () => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.setItem(DRAINED_KEY, "1");
  } catch {
    /* noop */
  }
};

// Compatibility shim for legacy reports persisted before the v0.5-A
// Supabase migration. The old shape used userId: "mock-user-1" and
// did not carry a `client` field. We derive client from clientLabel
// (lowercase, spaces stripped) when it's missing. The server PUT will
// fill in the rest.
function backfillLegacyReport(r: Report): Report {
  return {
    ...r,
    client:
      r.client ??
      r.clientLabel.toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9]/g, ""),
  };
}

async function fetchListFromServer(): Promise<
  | { ok: true; reports: Report[] }
  | { ok: false; status: number }
> {
  const res = await fetch("/api/reports", {
    method: "GET",
    headers: { accept: "application/json" },
  });
  if (!res.ok) return { ok: false, status: res.status };
  const body = (await res.json()) as { reports: Report[] };
  return { ok: true, reports: body.reports ?? [] };
}

async function pushReportToServer(r: Report): Promise<boolean> {
  try {
    const res = await fetch(`/api/reports/${encodeURIComponent(r.id)}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(r),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function deleteReportOnServer(id: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/reports/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    return res.ok;
  } catch {
    return false;
  }
}

type Source = "server" | "local";

/** Hook for the Reports surface. v0.5-A swaps the storage seam from
 *  localStorage to Supabase. Backward compat: on first mount, if the
 *  server returns zero rows and localStorage has any, drain them to
 *  the server, then drop the localStorage cache as source of truth.
 *  In environments without Supabase configured (preview / CI), the
 *  server returns 503 and the hook falls back to the legacy
 *  localStorage-only behaviour so UI work isn't blocked. */
export function useReports() {
  const [all, setAll] = useState<Report[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [source, setSource] = useState<Source>("server");
  const drainedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await fetchListFromServer();
      if (cancelled) return;

      if (!result.ok) {
        // 503 (no Supabase) or transient failure. Keep localStorage as
        // the source of truth, log loud enough to spot in dev.
        if (result.status !== 503) {
          console.warn({
            event: "reports.fetch.failed",
            status: result.status,
          });
        }
        setAll(readLocal().map(backfillLegacyReport));
        setSource("local");
        setHydrated(true);
        return;
      }

      const serverItems = result.reports;
      const local = readLocal();
      const alreadyDrained =
        typeof window !== "undefined" &&
        window.localStorage.getItem(DRAINED_KEY) === "1";

      if (
        !alreadyDrained &&
        serverItems.length === 0 &&
        local.length > 0 &&
        !drainedRef.current
      ) {
        drainedRef.current = true;
        // Best-effort drain. If any individual PUT fails, the report
        // stays in localStorage on retry (we only clear once every
        // upload succeeds).
        const filled = local.map(backfillLegacyReport);
        const results = await Promise.all(filled.map(pushReportToServer));
        if (results.every(Boolean)) {
          clearLocal();
          // Re-fetch to get the canonical server-side order + timestamps.
          const refetched = await fetchListFromServer();
          if (!cancelled && refetched.ok) {
            setAll(refetched.reports);
          } else if (!cancelled) {
            setAll(filled);
          }
        } else if (!cancelled) {
          // Partial drain. Show what's on the server plus the locals
          // we couldn't upload, so the user doesn't lose visibility.
          const serverIds = new Set(serverItems.map((r) => r.id));
          const merged = [
            ...serverItems,
            ...filled.filter((r) => !serverIds.has(r.id)),
          ];
          setAll(merged);
        }
      } else if (!cancelled) {
        setAll(serverItems);
      }

      if (!cancelled) {
        setSource("server");
        setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const items = useMemo(
    () => [...all].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX),
    [all],
  );

  const save = useCallback(
    (r: Report) => {
      const filled = backfillLegacyReport(r);
      const stamped = { ...filled, updatedAt: Date.now() };
      setAll((cur) => {
        const idx = cur.findIndex((x) => x.id === stamped.id);
        const next =
          idx >= 0
            ? cur.map((x, i) => (i === idx ? stamped : x))
            : [stamped, ...cur].slice(0, MAX);
        if (source === "local") writeLocal(next);
        return next;
      });
      if (source === "server") {
        void pushReportToServer(stamped);
      }
    },
    [source],
  );

  const remove = useCallback(
    (id: string) => {
      setAll((cur) => {
        const next = cur.filter((x) => x.id !== id);
        if (source === "local") writeLocal(next);
        return next;
      });
      if (source === "server") {
        void deleteReportOnServer(id);
      }
    },
    [source],
  );

  const get = useCallback(
    (id: string) => all.find((x) => x.id === id) ?? null,
    [all],
  );

  return { items, save, remove, get, hydrated };
}
