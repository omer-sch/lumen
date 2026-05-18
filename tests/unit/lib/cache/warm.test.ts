// Layer 2 (lib-unit). File under test: src/lib/cache/warm.ts.
//
// `warmClientCache` is the single entry point shared by the cron route
// and the admin Sync-now route. Tests assert:
//   1. Every cached query function gets called for the client - filtered
//      queries fan out across the WARM_FILTERS combos so each (OS,
//      platform) entry-point lands a primed key.
//   2. The dashboard "last 30 days" preset is what we pass.
//   3. A failing query does not poison the rest of the warm pass.
import { beforeEach, describe, expect, it, vi } from "vitest";

const queries = vi.hoisted(() => ({
  queryGlobalComixKPIs: vi.fn(),
  queryGlobalComixTrend: vi.fn(),
  queryGlobalComixChannelMix: vi.fn(),
  queryGlobalComixNetworkBreakdown: vi.fn(),
  queryGlobalComixPayback: vi.fn(),
  queryGlobalComixCampaigns: vi.fn(),
  queryGlobalComixDataBounds: vi.fn(),
  queryGlobalComixWeekends: vi.fn(),
  queryGlobalComixGeo: vi.fn(),
  queryGlobalComixCreatives: vi.fn(),
  queryGlobalComixAttributionValidation: vi.fn(),
}));

const subQueries = vi.hoisted(() => ({
  queryGlobalComixSubsDaily: vi.fn(),
  queryGlobalComixSubsOsMix: vi.fn(),
  queryGlobalComixNetSubTrend: vi.fn(),
}));

vi.mock("@/lib/globalcomix-queries", () => queries);
vi.mock("@/lib/globalcomix-subs-queries", () => subQueries);

import { warmClientCache } from "@/lib/cache/warm";

beforeEach(() => {
  for (const fn of Object.values(queries)) fn.mockReset();
  for (const fn of Object.values(subQueries)) fn.mockReset();
});

const WARM_COMBO_COUNT = 8; // see WARM_FILTERS in src/lib/cache/warm.ts
const FILTERED_QUERY_COUNT = 9; // kpis, trend, channel-mix, network-breakdown, payback, campaigns, weekends, geo, creatives
const FILTER_FREE_QUERY_COUNT = 5; // data-bounds, total-subs-daily, total-subs-os-mix, net-sub-trend, attribution-validation

describe("warmClientCache", () => {
  it("calls every cached query for every WARM_FILTERS combo", async () => {
    for (const fn of Object.values(queries)) fn.mockResolvedValue({});
    for (const fn of Object.values(subQueries)) fn.mockResolvedValue([]);
    const out = await warmClientCache("globalcomix");

    // 9 filtered queries x 8 combos + 5 filter-free queries = 77 calls.
    expect(out).toHaveLength(
      FILTERED_QUERY_COUNT * WARM_COMBO_COUNT + FILTER_FREE_QUERY_COUNT,
    );
    expect(out.every((r) => r.ok)).toBe(true);

    expect(queries.queryGlobalComixKPIs).toHaveBeenCalledTimes(WARM_COMBO_COUNT);
    expect(queries.queryGlobalComixDataBounds).toHaveBeenCalledOnce();
    expect(subQueries.queryGlobalComixSubsDaily).toHaveBeenCalledOnce();
    expect(queries.queryGlobalComixAttributionValidation).toHaveBeenCalledOnce();
  });

  it("warms each combo with the right GlobalComixFilter shape", async () => {
    for (const fn of Object.values(queries)) fn.mockResolvedValue({});
    for (const fn of Object.values(subQueries)) fn.mockResolvedValue([]);
    await warmClientCache("globalcomix");

    // Filters fed to queryGlobalComixKPIs, in WARM_FILTERS order.
    const filters = queries.queryGlobalComixKPIs.mock.calls.map(
      (call) => call[3],
    );
    expect(filters).toEqual([
      {},
      { os: "ios" },
      { os: "android" },
      { os: "web" },
      { platforms: ["meta"] },
      { platforms: ["google"] },
      { platforms: ["tiktok"] },
      { platforms: ["apple_search_ads"] },
    ]);
  });

  it("passes the last-30-days window in YYYY-MM-DD shape to the time-ranged queries", async () => {
    for (const fn of Object.values(queries)) fn.mockResolvedValue({});
    for (const fn of Object.values(subQueries)) fn.mockResolvedValue([]);
    await warmClientCache("globalcomix");

    const args = queries.queryGlobalComixKPIs.mock.calls[0];
    const [client, from, to] = args as [string, string, string];
    expect(client).toBe("globalcomix");
    expect(from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // The window is 30 days inclusive: from + 29 days === to.
    const days =
      (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      86_400_000;
    expect(days).toBe(29);
  });

  it("does not pass a date window to data-bounds (it's client-only)", async () => {
    for (const fn of Object.values(queries)) fn.mockResolvedValue({});
    for (const fn of Object.values(subQueries)) fn.mockResolvedValue([]);
    await warmClientCache("globalcomix");
    expect(queries.queryGlobalComixDataBounds).toHaveBeenCalledWith("globalcomix");
  });

  it("swallows a single query failure so the rest still warm", async () => {
    for (const fn of Object.values(queries)) fn.mockResolvedValue({});
    for (const fn of Object.values(subQueries)) fn.mockResolvedValue([]);
    queries.queryGlobalComixTrend.mockRejectedValue(new Error("bq timed out"));

    const out = await warmClientCache("globalcomix");
    const trendRows = out.filter((r) => r.query.startsWith("trend"));
    expect(trendRows.every((r) => !r.ok)).toBe(true);
    const kpisDefault = out.find((r) => r.query === "kpis");
    expect(kpisDefault?.ok).toBe(true);
  });
});
