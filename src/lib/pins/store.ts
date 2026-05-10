"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PinnedTile } from "./types";

/** Phase 1 mock identity. Swap to the real signed-in user id in Phase 2. */
export const MOCK_USER_ID = "mock-user-1";
const STORAGE_KEY = "lumen.pins";
const MAX_PINS = 24;

/** ---- Read / write seam — the *only* place we touch storage. Replace
 *  these two functions with a fetch to the pins API in Phase 2 and the
 *  rest of the app keeps working unchanged. */

const readAll = (): PinnedTile[] => {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PinnedTile[]) : [];
  } catch {
    return [];
  }
};

const writeAll = (items: PinnedTile[]) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* quota or disabled storage — silent */
  }
};

/** ---- Public API */

const newId = () => `pin_${crypto.randomUUID()}`;

export function usePinnedTiles(userId: string = MOCK_USER_ID) {
  const [all, setAll] = useState<PinnedTile[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setAll(readAll());
    setHydrated(true);
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setAll(readAll());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const tiles = useMemo(
    () =>
      all
        .filter((t) => t.userId === userId)
        .sort((a, b) => b.pinnedAt - a.pinnedAt),
    [all, userId],
  );

  const pin = useCallback(
    (input: Omit<PinnedTile, "id" | "userId" | "pinnedAt">) => {
      const tile: PinnedTile = {
        ...input,
        id: newId(),
        userId,
        pinnedAt: Date.now(),
      };
      setAll((cur) => {
        const next = [tile, ...cur].slice(0, MAX_PINS);
        writeAll(next);
        return next;
      });
      return tile;
    },
    [userId],
  );

  const unpin = useCallback((id: string) => {
    setAll((cur) => {
      const next = cur.filter((t) => t.id !== id);
      writeAll(next);
      return next;
    });
  }, []);

  return { tiles, pin, unpin, hydrated };
}
