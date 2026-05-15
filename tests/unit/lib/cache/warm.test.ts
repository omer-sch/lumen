// Layer 2 (lib-unit). File under test: src/lib/cache/warm.ts.
//
// `warmClientCache` is the single entry point shared by the cron route
// and the admin Sync-now route. Tests assert:
//   1. Every cached query function gets called for the client.
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
}));

vi.mock("@/lib/globalcomix-queries", () => queries);

import { warmClientCache } from "@/lib/cache/warm";

beforeEach(() => {
  for (const fn of Object.values(queries)) fn.mockReset();
});

describe("warmClientCache", () => {
  it("calls every cached query exactly once and reports ok=true", async () => {
    for (const fn of Object.values(queries)) fn.mockResolvedValue({});
    const out = await warmClientCache("globalcomix");

    expect(out.map((r) => r.query).sort()).toEqual(
      [
        "campaigns",
        "channel-mix",
        "data-bounds",
        "kpis",
        "network-breakdown",
        "payback",
        "trend",
      ].sort(),
    );
    expect(out.every((r) => r.ok)).toBe(true);

    for (const [name, fn] of Object.entries(queries)) {
      expect(fn, name).toHaveBeenCalledOnce();
    }
  });

  it("passes the last-30-days window in YYYY-MM-DD shape to the time-ranged queries", async () => {
    for (const fn of Object.values(queries)) fn.mockResolvedValue({});
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
    await warmClientCache("globalcomix");
    expect(queries.queryGlobalComixDataBounds).toHaveBeenCalledWith("globalcomix");
  });

  it("swallows a single query failure so the rest still warm", async () => {
    for (const fn of Object.values(queries)) fn.mockResolvedValue({});
    queries.queryGlobalComixTrend.mockRejectedValue(new Error("bq timed out"));

    const out = await warmClientCache("globalcomix");
    const trend = out.find((r) => r.query === "trend");
    const kpis = out.find((r) => r.query === "kpis");
    expect(trend?.ok).toBe(false);
    expect(trend?.error).toContain("bq timed out");
    expect(kpis?.ok).toBe(true);
  });
});
