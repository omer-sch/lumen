"use client";

import { useCallback, useEffect, useState } from "react";
import type { PinnedTile } from "./types";

/**
 * @deprecated The hook now resolves the owner server-side from the
 * Clerk session (or PREVIEW_USER_ID in preview mode). Passing a userId
 * argument is ignored. Kept as an export so existing imports don't
 * break during the cutover; remove in a follow-up.
 */
export const MOCK_USER_ID = "mock-user-1";

const MAX_PINS = 24;

/**
 * Pinned tiles, backed by /api/pins. Same interface as the previous
 * localStorage-backed hook ({ tiles, pin, unpin, hydrated }) so call
 * sites don't change. `hydrated` flips true after the initial fetch
 * — components that render skeletons while loading should use it.
 *
 * Mutations are optimistic: `pin` prepends locally, then reconciles
 * with the server response; `unpin` removes locally, then fires DELETE.
 * If the server rejects, we log and leave the local state — preview
 * mode returns 200 without persisting so this still feels right there.
 */
export function usePinnedTiles(_userId?: string) {
  void _userId;
  const [tiles, setTiles] = useState<PinnedTile[]>([]);
  const [hydrated, setHydrated] = useState(false);

  // Initial load.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/pins", { cache: "no-store" });
        if (!res.ok) throw new Error(`GET /api/pins ${res.status}`);
        const { tiles: server } = (await res.json()) as { tiles: PinnedTile[] };
        if (!cancelled) setTiles(server);
      } catch (err) {
        console.error("[pins] load failed", err);
      } finally {
        if (!cancelled) setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const pin = useCallback(
    (input: Omit<PinnedTile, "id" | "userId" | "pinnedAt">) => {
      const optimistic: PinnedTile = {
        ...input,
        id: `tmp_${crypto.randomUUID()}`,
        userId: "pending",
        pinnedAt: Date.now(),
      };
      setTiles((cur) => [optimistic, ...cur].slice(0, MAX_PINS));

      (async () => {
        try {
          const res = await fetch("/api/pins", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              label: input.label,
              question: input.question,
              config: input.config,
              source: "ask",
            }),
          });
          if (!res.ok) throw new Error(`POST /api/pins ${res.status}`);
          const { tile, persisted } = (await res.json()) as {
            tile: PinnedTile | null;
            persisted: boolean;
          };
          if (persisted && tile) {
            setTiles((cur) =>
              cur.map((t) => (t.id === optimistic.id ? tile : t)),
            );
          }
        } catch (err) {
          console.error("[pins] persist pin failed", err);
        }
      })();

      return optimistic;
    },
    [],
  );

  const unpin = useCallback((id: string) => {
    setTiles((cur) => cur.filter((t) => t.id !== id));
    (async () => {
      try {
        const res = await fetch(`/api/pins/${encodeURIComponent(id)}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error(`DELETE /api/pins/${id} ${res.status}`);
      } catch (err) {
        console.error("[pins] persist unpin failed", err);
      }
    })();
  }, []);

  return { tiles, pin, unpin, hydrated };
}
