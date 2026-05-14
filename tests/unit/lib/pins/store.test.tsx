// Layer 1 (frontend hook). File under test: src/lib/pins/store.ts. Priority: P1.
// usePinnedTiles is the Dashboard's pinned-tile state, backed by /api/pins.
// Mutations are optimistic — pin/unpin must update the local list before the
// POST/DELETE resolves so the UI feels instant. We mock fetch and crypto so
// the suite stays deterministic.
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PinnedConfig, PinnedTile } from "@/lib/pins/types";
import { usePinnedTiles } from "@/lib/pins/store";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  // Default GET response → empty list.
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ tiles: [] }), { status: 200 }),
  );
  vi.stubGlobal("fetch", fetchMock);

  // crypto.randomUUID is used to seed optimistic ids. Make it deterministic.
  let counter = 0;
  vi.stubGlobal("crypto", {
    ...(globalThis.crypto as Crypto),
    randomUUID: () => `uuid-${++counter}` as `${string}-${string}-${string}-${string}-${string}`,
  });

  // Silence console.error from the optimistic-failure paths.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const kpiConfig: PinnedConfig = {
  kind: "kpi",
  metric: "spend",
  value: "$285k",
  delta: 12,
  direction: "higher-better",
};

describe("usePinnedTiles: initial load", () => {
  it("flips hydrated=true after the initial GET resolves", async () => {
    const { result } = renderHook(() => usePinnedTiles());
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(fetchMock).toHaveBeenCalledWith("/api/pins", { cache: "no-store" });
    expect(result.current.tiles).toEqual([]);
  });

  it("hydrates with the server-provided tiles", async () => {
    const server: PinnedTile[] = [
      {
        id: "srv-1",
        userId: "user_test",
        pinnedAt: 1_700_000_000_000,
        config: kpiConfig,
      },
    ];
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ tiles: server }), { status: 200 }),
    );
    const { result } = renderHook(() => usePinnedTiles());
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.tiles).toEqual(server);
  });

  it("logs and continues when /api/pins GET fails", async () => {
    fetchMock.mockResolvedValueOnce(new Response("nope", { status: 500 }));
    const { result } = renderHook(() => usePinnedTiles());
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.tiles).toEqual([]);
  });
});

describe("usePinnedTiles: pin (optimistic)", () => {
  it("prepends an optimistic tile immediately, then reconciles with the server", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ tiles: [] }), { status: 200 }),
    );
    const persisted: PinnedTile = {
      id: "srv-99",
      userId: "user_test",
      pinnedAt: 1_700_000_000_000,
      label: "Spend",
      config: kpiConfig,
    };
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ tile: persisted, persisted: true }),
        { status: 200 },
      ),
    );

    const { result } = renderHook(() => usePinnedTiles());
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    act(() => {
      result.current.pin({ label: "Spend", config: kpiConfig });
    });

    // Optimistic tile lands synchronously; id is prefixed with `tmp_`.
    expect(result.current.tiles).toHaveLength(1);
    expect(result.current.tiles[0].id).toMatch(/^tmp_/);

    // Server tile replaces the optimistic one.
    await waitFor(() => expect(result.current.tiles[0].id).toBe("srv-99"));
  });

  it("falls back to leaving the optimistic tile when POST fails", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ tiles: [] }), { status: 200 }),
    );
    fetchMock.mockResolvedValueOnce(new Response("err", { status: 500 }));

    const { result } = renderHook(() => usePinnedTiles());
    await waitFor(() => expect(result.current.hydrated).toBe(true));

    act(() => {
      result.current.pin({ label: "Spend", config: kpiConfig });
    });
    await waitFor(() => {
      expect(result.current.tiles).toHaveLength(1);
      expect(result.current.tiles[0].id).toMatch(/^tmp_/);
    });
  });

  it("caps the local list at MAX_PINS (24) on optimistic prepend", async () => {
    const existing: PinnedTile[] = Array.from({ length: 24 }, (_, i) => ({
      id: `srv-${i}`,
      userId: "user_test",
      pinnedAt: 1_700_000_000_000 - i,
      config: kpiConfig,
    }));
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ tiles: existing }), { status: 200 }),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ tile: null, persisted: false }),
        { status: 200 },
      ),
    );

    const { result } = renderHook(() => usePinnedTiles());
    await waitFor(() => expect(result.current.hydrated).toBe(true));
    expect(result.current.tiles).toHaveLength(24);

    act(() => {
      result.current.pin({ label: "New", config: kpiConfig });
    });
    expect(result.current.tiles).toHaveLength(24);
    // The new optimistic tile is at the head; the oldest got pushed off.
    expect(result.current.tiles[0].id).toMatch(/^tmp_/);
  });
});

describe("usePinnedTiles: unpin (optimistic)", () => {
  it("removes the tile locally and fires DELETE", async () => {
    const tile: PinnedTile = {
      id: "srv-7",
      userId: "user_test",
      pinnedAt: 1_700_000_000_000,
      config: kpiConfig,
    };
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ tiles: [tile] }), { status: 200 }),
    );
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    const { result } = renderHook(() => usePinnedTiles());
    await waitFor(() => expect(result.current.tiles).toHaveLength(1));

    act(() => {
      result.current.unpin("srv-7");
    });
    expect(result.current.tiles).toHaveLength(0);
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/pins/srv-7", {
        method: "DELETE",
      }),
    );
  });

  it("ignores DELETE failure (local state already removed)", async () => {
    const tile: PinnedTile = {
      id: "srv-9",
      userId: "user_test",
      pinnedAt: 1_700_000_000_000,
      config: kpiConfig,
    };
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ tiles: [tile] }), { status: 200 }),
    );
    fetchMock.mockResolvedValueOnce(new Response("", { status: 500 }));

    const { result } = renderHook(() => usePinnedTiles());
    await waitFor(() => expect(result.current.tiles).toHaveLength(1));

    act(() => {
      result.current.unpin("srv-9");
    });
    expect(result.current.tiles).toHaveLength(0);
  });
});
