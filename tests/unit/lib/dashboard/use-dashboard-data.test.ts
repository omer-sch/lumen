// Layer 2 (frontend lib unit). File under test:
// src/lib/dashboard/use-dashboard-data.ts. Priority: P1.
//
// The hook itself is React-bound (useEffect, useState); the heavy lifting
// it does — translating BQ trend rows into the per-network grouped shape
// the chart consumes — is in pure helpers we exercise here.
import { describe, expect, it } from "vitest";

import { groupTrendByNetwork } from "@/lib/dashboard/use-dashboard-data";
import type { BQTrendPointByNetwork } from "@/types/dashboard";

const point = (
  date: string,
  network: string,
  overrides: Partial<BQTrendPointByNetwork> = {},
): BQTrendPointByNetwork => ({
  date,
  network,
  spend: 100,
  installs: 10,
  cpi: 10,
  roas: 0.5,
  ...overrides,
});

describe("groupTrendByNetwork", () => {
  it("buckets per-(date, network) rows into one group per network", () => {
    const rows: BQTrendPointByNetwork[] = [
      point("2026-05-01", "Google", { spend: 100 }),
      point("2026-05-01", "Meta", { spend: 200 }),
      point("2026-05-02", "Google", { spend: 110 }),
      point("2026-05-02", "Meta", { spend: 210 }),
    ];
    const groups = groupTrendByNetwork(rows);
    expect(groups.map((g) => g.network)).toEqual(["Google", "Meta"]);
    expect(groups[0].points.map((p) => p.date)).toEqual(["05-01", "05-02"]);
    // Spend is rounded; CPI is float-fixed to 2 decimals — shape changes
    // mirror the toTrendPoint coercion.
    expect(groups[0].points[0].spend).toBe(100);
    expect(groups[1].points[1].spend).toBe(210);
  });

  it("returns an empty array on empty input", () => {
    expect(groupTrendByNetwork([])).toEqual([]);
  });

  it("preserves the insertion order of networks (chart x-axis stability)", () => {
    const rows: BQTrendPointByNetwork[] = [
      point("2026-05-01", "TikTok"),
      point("2026-05-01", "Apple Search Ads"),
      point("2026-05-01", "Meta"),
      point("2026-05-01", "Google"),
    ];
    const groups = groupTrendByNetwork(rows);
    expect(groups.map((g) => g.network)).toEqual([
      "TikTok",
      "Apple Search Ads",
      "Meta",
      "Google",
    ]);
  });

  it("strips the date prefix so the chart's x-axis reads as MM-DD", () => {
    const groups = groupTrendByNetwork([point("2026-05-14", "Google")]);
    expect(groups[0].points[0].date).toBe("05-14");
  });
});

// ── WS1 - filter wiring through to /api/bq/* URLs ──────────────────────────
//
// The hook is React-bound, so we use renderHook + a stubbed fetch to
// observe the URLs it issues. Assertion shape: capture every URL fetched
// for the active filter state, assert presence / absence of `os` and
// `platforms` query params.

import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, vi } from "vitest";
import { useDashboardData } from "@/lib/dashboard/use-dashboard-data";

describe("useDashboardData - filter wiring", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  let calls: string[] = [];

  beforeEach(() => {
    calls = [];
    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      calls.push(String(url));
      // Stub a minimum-viable payload per route so the hook resolves.
      const u = String(url);
      let body: unknown = [];
      if (u.includes("/dashboard-kpis"))
        body = { spend: 100, installs: 10, cpi: 10, roas: 0.5 };
      else if (u.includes("/data-bounds"))
        body = { earliest: "2026-04-01", latest: "2026-05-14" };
      return new Response(JSON.stringify(body), {
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

  it("default filter state omits ?os and ?platforms from every URL", async () => {
    renderHook(() =>
      useDashboardData({
        from: FROM,
        to: TO,
        client: "globalcomix",
        os: "total",
        platforms: [],
      }),
    );
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    for (const url of calls) {
      expect(url, `default URL must not carry ?os: ${url}`).not.toMatch(/[?&]os=/);
      expect(url, `default URL must not carry ?platforms: ${url}`).not.toMatch(
        /[?&]platforms=/,
      );
    }
  });

  it("os=ios threads ?os=ios into every filterable URL", async () => {
    renderHook(() =>
      useDashboardData({
        from: FROM,
        to: TO,
        client: "globalcomix",
        os: "ios",
        platforms: [],
      }),
    );
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    // data-bounds is the one route that doesn't take filters.
    const filterableCalls = calls.filter((u) => !u.includes("/data-bounds"));
    expect(filterableCalls.length).toBeGreaterThan(0);
    for (const url of filterableCalls) {
      expect(url).toContain("os=ios");
    }
    // data-bounds still skips os intentionally.
    const dataBoundsCall = calls.find((u) => u.includes("/data-bounds"));
    expect(dataBoundsCall, "data-bounds must still be called").toBeDefined();
    expect(dataBoundsCall).not.toMatch(/[?&]os=/);
  });

  it("platforms=['meta','google'] joins comma-separated on the URL", async () => {
    renderHook(() =>
      useDashboardData({
        from: FROM,
        to: TO,
        client: "globalcomix",
        os: "total",
        platforms: ["meta", "google"],
      }),
    );
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    const filterableCalls = calls.filter((u) => !u.includes("/data-bounds"));
    for (const url of filterableCalls) {
      // URLSearchParams encodes "," as "%2C", which is what real fetches see.
      expect(url).toMatch(/platforms=meta%2Cgoogle|platforms=meta,google/);
    }
  });

  it("changing os triggers a new fetch (filter wiring re-runs the effect)", async () => {
    const { rerender } = renderHook(
      ({ os }: { os: "total" | "ios" }) =>
        useDashboardData({
          from: FROM,
          to: TO,
          client: "globalcomix",
          os,
          platforms: [],
        }),
      { initialProps: { os: "total" } },
    );
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    const beforeCount = calls.length;
    rerender({ os: "ios" });
    await waitFor(() => expect(calls.length).toBeGreaterThan(beforeCount));
    // Some of the post-rerender URLs now carry the os param.
    const postCalls = calls.slice(beforeCount);
    expect(
      postCalls.some((u) => u.includes("os=ios")),
      "at least one new fetch should carry os=ios",
    ).toBe(true);
  });

  it("re-rendering with a new platforms array reference (same values) does NOT refetch", async () => {
    const { rerender } = renderHook(
      ({ platforms }: { platforms: ("meta" | "google")[] }) =>
        useDashboardData({
          from: FROM,
          to: TO,
          client: "globalcomix",
          os: "total",
          platforms,
        }),
      { initialProps: { platforms: ["meta"] as ("meta" | "google")[] } },
    );
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    const beforeCount = calls.length;
    // Same values, NEW array reference - the platforms.join(",") dep
    // should keep the effect from re-firing.
    rerender({ platforms: ["meta"] });
    // Give the microtask queue a tick to flush any spurious effect run.
    await new Promise((r) => setTimeout(r, 30));
    expect(calls.length).toBe(beforeCount);
  });
});
