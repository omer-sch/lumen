// Layer 2 (frontend lib unit). File under test:
// src/lib/campaigns/use-campaigns-data.ts. Priority: P1.
//
// React-bound hook — uses renderHook + a stubbed fetch to observe URL
// shape and refetch behavior under filter changes.

import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useCampaignsData } from "@/lib/campaigns/use-campaigns-data";

describe("useCampaignsData - URL shape and refetch wiring", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  let calls: string[] = [];

  beforeEach(() => {
    calls = [];
    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      calls.push(String(url));
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  const FROM = new Date(Date.UTC(2026, 3, 15));
  const TO = new Date(Date.UTC(2026, 4, 14));

  it("default filter state omits ?os and ?platforms from the URL", async () => {
    renderHook(() =>
      useCampaignsData({
        from: FROM,
        to: TO,
        client: "globalcomix",
        os: "total",
        platforms: [],
      }),
    );
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    expect(calls[0]).toContain("/api/bq/campaigns?");
    expect(calls[0]).toContain("client=globalcomix");
    expect(calls[0]).toContain("from=2026-04-15");
    expect(calls[0]).toContain("to=2026-05-14");
    expect(calls[0], "default URL must not carry ?os").not.toMatch(/[?&]os=/);
    expect(calls[0], "default URL must not carry ?platforms").not.toMatch(
      /[?&]platforms=/,
    );
  });

  it("os=ios threads ?os=ios onto the URL", async () => {
    renderHook(() =>
      useCampaignsData({
        from: FROM,
        to: TO,
        client: "globalcomix",
        os: "ios",
        platforms: [],
      }),
    );
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    expect(calls[0]).toContain("os=ios");
  });

  it("platforms=['meta','google'] joins comma-separated on the URL", async () => {
    renderHook(() =>
      useCampaignsData({
        from: FROM,
        to: TO,
        client: "globalcomix",
        os: "total",
        platforms: ["meta", "google"],
      }),
    );
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    // URLSearchParams encodes "," as "%2C" which is what real fetches see.
    expect(calls[0]).toMatch(/platforms=meta%2Cgoogle|platforms=meta,google/);
  });

  it("changing os triggers a new fetch", async () => {
    const { rerender } = renderHook(
      ({ os }: { os: "total" | "ios" }) =>
        useCampaignsData({
          from: FROM,
          to: TO,
          client: "globalcomix",
          os,
          platforms: [],
        }),
      { initialProps: { os: "total" } },
    );
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    const before = calls.length;
    rerender({ os: "ios" });
    await waitFor(() => expect(calls.length).toBeGreaterThan(before));
    expect(calls.slice(before).some((u) => u.includes("os=ios"))).toBe(true);
  });

  it("same-content platforms array (new reference) does NOT refetch", async () => {
    const { rerender } = renderHook(
      ({ platforms }: { platforms: ("meta" | "google")[] }) =>
        useCampaignsData({
          from: FROM,
          to: TO,
          client: "globalcomix",
          os: "total",
          platforms,
        }),
      { initialProps: { platforms: ["meta"] as ("meta" | "google")[] } },
    );
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    const before = calls.length;
    // New array reference, same values — platforms.join(",") dep should
    // collapse this into a no-op effect run.
    rerender({ platforms: ["meta"] });
    await new Promise((r) => setTimeout(r, 30));
    expect(calls.length).toBe(before);
  });

  it("changing client routes to the per-client api base when applicable", async () => {
    const { rerender } = renderHook(
      ({ client }: { client: string }) =>
        useCampaignsData({
          from: FROM,
          to: TO,
          client,
          os: "total",
          platforms: [],
        }),
      { initialProps: { client: "globalcomix" } },
    );
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    expect(calls[0]).toContain("/api/bq/campaigns");
    // 100play has its own per-client base under /api/bq/100play.
    const before = calls.length;
    rerender({ client: "100play" });
    await waitFor(() => expect(calls.length).toBeGreaterThan(before));
    const newCall = calls.slice(before)[0];
    expect(newCall).toContain("/api/bq/100play/campaigns");
    expect(newCall).toContain("client=100play");
  });

  it("rows starts null while the first fetch is in flight", async () => {
    let resolveFetch: (() => void) | undefined;
    fetchSpy.mockImplementationOnce(
      () =>
        new Promise<Response>((r) => {
          resolveFetch = (): void => {
            r(
              new Response(JSON.stringify([]), {
                status: 200,
                headers: { "Content-Type": "application/json" },
              }),
            );
          };
        }),
    );
    const { result } = renderHook(() =>
      useCampaignsData({
        from: FROM,
        to: TO,
        client: "globalcomix",
        os: "total",
        platforms: [],
      }),
    );
    expect(result.current.rows).toBeNull();
    expect(result.current.loading).toBe(true);
    resolveFetch?.();
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.rows).toEqual([]);
  });

  it("error surfaces a top-level error string with rows=null on first failure", async () => {
    fetchSpy.mockImplementationOnce(
      async () =>
        new Response(JSON.stringify({ error: "boom" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }),
    );
    const { result } = renderHook(() =>
      useCampaignsData({
        from: FROM,
        to: TO,
        client: "globalcomix",
        os: "total",
        platforms: [],
      }),
    );
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toContain("500");
    expect(result.current.rows).toBeNull();
  });
});
