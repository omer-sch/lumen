"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Report } from "./types";

const STORAGE_KEY = "lumen.reports";
const MAX = 24;

const read = (): Report[] => {
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

const write = (items: Report[]) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* quota or disabled — silent */
  }
};

/** Hook + thin wrappers around the storage seam. Phase 2 swaps these for
 *  an authenticated REST call; the rest of the Reports page keeps working. */
export function useReports() {
  const [all, setAll] = useState<Report[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setAll(read());
    setHydrated(true);
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setAll(read());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const items = useMemo(
    () => [...all].sort((a, b) => b.updatedAt - a.updatedAt),
    [all],
  );

  const save = useCallback((r: Report) => {
    setAll((cur) => {
      const idx = cur.findIndex((x) => x.id === r.id);
      const next =
        idx >= 0
          ? cur.map((x, i) => (i === idx ? { ...r, updatedAt: Date.now() } : x))
          : [{ ...r, updatedAt: Date.now() }, ...cur].slice(0, MAX);
      write(next);
      return next;
    });
  }, []);

  const remove = useCallback((id: string) => {
    setAll((cur) => {
      const next = cur.filter((x) => x.id !== id);
      write(next);
      return next;
    });
  }, []);

  const get = useCallback(
    (id: string) => all.find((x) => x.id === id) ?? null,
    [all],
  );

  return { items, save, remove, get, hydrated };
}
