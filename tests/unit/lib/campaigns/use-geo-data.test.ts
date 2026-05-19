// Layer 2 (frontend lib unit). File under test:
//   src/lib/campaigns/use-geo-data.ts
// Priority: P1.
//
// React-bound hook — use renderHook + a stubbed fetch to observe URL
// shape and state transitions through loading / data / error.

import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useGeoData } from "@/lib/campaigns/use-geo-data";

describe("useGeoData", () => {
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

  it("hits the geo route with client + date params", async () => {
    renderHook(() =>
      useGeoData({
        from: FROM,
        to: TO,
        client: "globalcomix",
        os: "total",
        platforms: [],
      }),
    );
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    expect(calls[0]).toContain("/api/bq/geo?");
    expect(calls[0]).toContain("client=globalcomix");
    expect(calls[0]).toContain("from=2026-04-15");
    expect(calls[0]).toContain("to=2026-05-14");
    // Defaults stay off the URL so cache keys match pre-filter.
    expect(calls[0]).not.toMatch(/[?&]os=/);
    expect(calls[0]).not.toMatch(/[?&]platforms=/);
  });

  it("threads os + platforms onto the URL when non-default", async () => {
    renderHook(() =>
      useGeoData({
        from: FROM,
        to: TO,
        client: "globalcomix",
        os: "android",
        platforms: ["meta", "tiktok"],
      }),
    );
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    expect(calls[0]).toMatch(/[?&]os=android/);
    expect(calls[0]).toMatch(/[?&]platforms=meta%2Ctiktok|platforms=meta,tiktok/);
  });

  it("returns rows once the fetch resolves and clears loading", async () => {
    fetchSpy.mockImplementationOnce(async () => {
      return new Response(
        JSON.stringify([
          {
            country_code: "US",
            country_name: "United States",
            spend: 0,
            installs: 0,
            sub_d7: 120,
            rev_d7: 1500,
            cpa_d7: 0,
            roi_d7: 0,
            sub_paid: 100,
            sub_organic: 20,
          },
        ]),
        { status: 200 },
      );
    });
    const { result } = renderHook(() =>
      useGeoData({
        from: FROM,
        to: TO,
        client: "globalcomix",
        os: "total",
        platforms: [],
      }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.rows).toHaveLength(1);
    expect(result.current.rows?.[0].country_code).toBe("US");
    expect(result.current.error).toBeNull();
  });
});
