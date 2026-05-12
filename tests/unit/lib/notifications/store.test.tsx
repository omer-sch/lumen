// Layer 1 (frontend hook). File under test: src/lib/notifications/store.ts. Priority: P1.
// Hook drives the bell + notification panel. Read state must persist across
// reloads via localStorage and stay in sync across tabs via the storage event.
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useNotifications } from "@/lib/notifications/store";
import {
  DEFAULT_UNREAD_IDS,
  MOCK_NOTIFICATIONS,
} from "@/lib/mock/notifications";

describe("useNotifications", () => {
  it("hydrates with the DEFAULT_UNREAD_IDS marked unread on first visit", async () => {
    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.unreadCount).toBe(DEFAULT_UNREAD_IDS.length);
    expect(result.current.items.length).toBe(MOCK_NOTIFICATIONS.length);
  });

  it("markRead decrements unreadCount and persists across re-renders", async () => {
    const { result, rerender } = renderHook(() => useNotifications());
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    const firstUnread = result.current.items.find((n) => !n.read);
    expect(firstUnread).toBeDefined();
    const before = result.current.unreadCount;
    act(() => result.current.markRead(firstUnread!.id));
    expect(result.current.unreadCount).toBe(before - 1);
    rerender();
    expect(result.current.unreadCount).toBe(before - 1);
  });

  it("markUnread reverses markRead", async () => {
    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    const target = result.current.items.find((n) => !n.read);
    expect(target).toBeDefined();
    act(() => result.current.markRead(target!.id));
    expect(result.current.items.find((n) => n.id === target!.id)?.read).toBe(true);
    act(() => result.current.markUnread(target!.id));
    expect(result.current.items.find((n) => n.id === target!.id)?.read).toBe(false);
  });

  it("markAllRead drives unreadCount to zero", async () => {
    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    act(() => result.current.markAllRead());
    expect(result.current.unreadCount).toBe(0);
    expect(result.current.items.every((n) => n.read)).toBe(true);
  });

  it("markRead is a no-op when the id is already read", async () => {
    const { result } = renderHook(() => useNotifications());
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    const readItem = result.current.items.find((n) => n.read);
    expect(readItem).toBeDefined();
    const before = result.current.unreadCount;
    act(() => result.current.markRead(readItem!.id));
    expect(result.current.unreadCount).toBe(before);
  });
});
