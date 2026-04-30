"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_UNREAD_IDS,
  MOCK_NOTIFICATIONS,
  type NotificationItem,
} from "@/lib/mock/notifications";

const STORAGE_KEY = "lumen.notifications.read";

const readSet = (): Set<string> => {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
};

const writeSet = (ids: Set<string>) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
  } catch {
    /* quota or disabled — silent */
  }
};

export type DecoratedNotification = NotificationItem & { read: boolean };

/**
 * useNotifications — single source of truth for the bell + panel.
 * Read state is persistent (localStorage) and syncs across tabs via
 * the `storage` event. SSR returns an empty list, hydrates on mount.
 *
 * The first 5 items in the demo dataset are "fresh" — they only
 * appear unread on the client's first visit, after which read
 * state is fully user-controlled.
 */
export function useNotifications() {
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = readSet();
    if (stored.size === 0) {
      // First-visit baseline: everything except DEFAULT_UNREAD_IDS is read.
      const baseline = new Set(
        MOCK_NOTIFICATIONS.filter((n) => !DEFAULT_UNREAD_IDS.includes(n.id)).map(
          (n) => n.id,
        ),
      );
      writeSet(baseline);
      setReadIds(baseline);
    } else {
      setReadIds(stored);
    }
    setHydrated(true);

    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setReadIds(readSet());
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const items = useMemo<DecoratedNotification[]>(
    () =>
      MOCK_NOTIFICATIONS.map((n) => ({ ...n, read: readIds.has(n.id) })),
    [readIds],
  );

  const unreadCount = useMemo(
    () => items.filter((n) => !n.read).length,
    [items],
  );

  const markRead = useCallback((id: string) => {
    setReadIds((cur) => {
      if (cur.has(id)) return cur;
      const next = new Set(cur);
      next.add(id);
      writeSet(next);
      return next;
    });
  }, []);

  const markAllRead = useCallback(() => {
    setReadIds(() => {
      const next = new Set(MOCK_NOTIFICATIONS.map((n) => n.id));
      writeSet(next);
      return next;
    });
  }, []);

  const markUnread = useCallback((id: string) => {
    setReadIds((cur) => {
      if (!cur.has(id)) return cur;
      const next = new Set(cur);
      next.delete(id);
      writeSet(next);
      return next;
    });
  }, []);

  return {
    items,
    unreadCount,
    hydrated,
    markRead,
    markAllRead,
    markUnread,
  };
}
