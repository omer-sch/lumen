// Layer 2 (frontend lib unit). Files under test:
//   src/lib/campaigns/use-creative-breakdown.ts
//   src/lib/campaigns/use-top-ad-trend.ts
// Priority: P1.
//
// React-bound hooks — use renderHook + a stubbed fetch to observe URL
// shape and state transitions through loading / data / error.

import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useCreativeBreakdown } from "@/lib/campaigns/use-creative-breakdown";
import { useTopAdTrend } from "@/lib/campaigns/use-top-ad-trend";

describe("useCreativeBreakdown", () => {
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

  it("hits the creatives route with client + date params", async () => {
    renderHook(() =>
      useCreativeBreakdown({
        from: FROM,
        to: TO,
        client: "globalcomix",
        os: "total",
        platforms: [],
      }),
    );
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    expect(calls[0]).toContain("/api/bq/creatives?");
    expect(calls[0]).toContain("client=globalcomix");
    expect(calls[0]).toContain("from=2026-04-15");
    expect(calls[0]).toContain("to=2026-05-14");
    // Default os/platforms are NOT serialized so the cache key matches
    // the pre-filter shape for unchanged loads.
    expect(calls[0]).not.toMatch(/[?&]os=/);
    expect(calls[0]).not.toMatch(/[?&]platforms=/);
  });

  it("threads os + platforms onto the URL when non-default", async () => {
    renderHook(() =>
      useCreativeBreakdown({
        from: FROM,
        to: TO,
        client: "globalcomix",
        os: "ios",
        platforms: ["meta", "tiktok"],
      }),
    );
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    expect(calls[0]).toMatch(/[?&]os=ios/);
    expect(calls[0]).toMatch(/[?&]platforms=meta%2Ctiktok|platforms=meta,tiktok/);
  });

  it("returns rows once the fetch resolves and clears loading", async () => {
    fetchSpy.mockImplementationOnce(async () => {
      return new Response(
        JSON.stringify([
          {
            ad_id: "fb-1",
            ad_name: "x",
            creative_name: "",
            adset_name: "",
            campaign_id: "c1",
            campaign_name: "Campaign1",
            network: "Meta",
            thumbnail_url: null,
            spend: 100,
            installs: 10,
            clicks: null,
            impressions: null,
            sub_start_d7: 0,
            sub_d7: 0,
            rev_d7: 0,
            cpi: 10,
            cpa_d7: null,
            roi_d7: null,
          },
        ]),
        { status: 200 },
      );
    });
    const { result } = renderHook(() =>
      useCreativeBreakdown({
        from: FROM,
        to: TO,
        client: "globalcomix",
        os: "total",
        platforms: [],
      }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.rows).toHaveLength(1);
    expect(result.current.rows?.[0].network).toBe("Meta");
    expect(result.current.error).toBeNull();
  });
});

describe("useTopAdTrend", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  let calls: string[] = [];

  beforeEach(() => {
    calls = [];
    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      calls.push(String(url));
      return new Response(
        JSON.stringify({ top_ad: null, points: [] }),
        { status: 200 },
      );
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  const FROM = new Date(Date.UTC(2026, 3, 15));
  const TO = new Date(Date.UTC(2026, 4, 14));

  it("hits the top-ad-trend nested route", async () => {
    renderHook(() =>
      useTopAdTrend({
        from: FROM,
        to: TO,
        client: "globalcomix",
        os: "total",
        platforms: [],
      }),
    );
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    expect(calls[0]).toContain("/api/bq/creatives/top-ad-trend?");
    expect(calls[0]).toContain("client=globalcomix");
  });

  it("returns the empty-state shape when the server says no top ad", async () => {
    const { result } = renderHook(() =>
      useTopAdTrend({
        from: FROM,
        to: TO,
        client: "globalcomix",
        os: "total",
        platforms: [],
      }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.data?.top_ad).toBeNull();
    expect(result.current.data?.points).toEqual([]);
    expect(result.current.error).toBeNull();
  });
});
