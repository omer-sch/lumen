// @vitest-environment node
// Layer 2 (lib unit). File under test: src/lib/analyst/history.ts.
//
// Verifies the multi-week trailing-history pull:
//   - Period-agnostic anchor: walks back HISTORY_WEEKS=4 calendar weeks
//     from whatever periodIsoStart the caller passes. No literal week
//     number or date is allowed in the code path.
//   - Issues exactly HISTORY_WEEKS parallel calls to
//     queryGlobalComixNetworkBreakdown with non-overlapping shifted
//     ranges.
//   - Each trailing range is 7 days long and aligned so week 1 ends
//     one day before periodIsoStart.
//   - WeeklyHistoryRow.weekNumber and weekLabel derive from the row's
//     own dates, never from the anchor.
//   - Handles unparseable anchors and per-week BQ failures gracefully.

import { beforeEach, describe, expect, it, vi } from "vitest";

const networkBreakdownMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/globalcomix-queries", () => ({
  queryGlobalComixNetworkBreakdown: networkBreakdownMock,
}));

import {
  fetchTrailingWeeks,
  HISTORY_WEEKS,
} from "@/lib/analyst/history";
import type { NetworkRow } from "@/types/dashboard";

function net(network: string, spend: number): NetworkRow {
  return {
    network,
    spend,
    share: 0,
    installs: 0,
    clicks: 0,
    impressions: 0,
    ftdD7: 0,
    subStart: 0,
    subD0: 0,
    subD7: 0,
    cpi: 0,
    cpSubStart: 0,
    cpaD0: 0,
    cpaD7: 0,
    ctr: 0,
    cpm: 0,
    cpc: 0,
    roasD7: 0,
    roasD14: 0,
    roasD30: 0,
    roasD90: 0,
    payersD7: 0,
    retD7: 0,
    trailingCpaD7Avg: 0,
  };
}

beforeEach(() => {
  networkBreakdownMock.mockReset();
});

describe("fetchTrailingWeeks", () => {
  it("fires HISTORY_WEEKS parallel queries with shifted ranges", async () => {
    networkBreakdownMock.mockResolvedValue([]);

    await fetchTrailingWeeks({
      client: "globalcomix",
      periodIsoStart: "2026-05-04",
    });

    expect(networkBreakdownMock).toHaveBeenCalledTimes(HISTORY_WEEKS);

    // Inspect each call's (client, from, to) args.
    const calls = networkBreakdownMock.mock.calls.map(
      ([client, from, to]) => ({ client, from, to }),
    );
    // Week 1 ends one day before the anchor; week N ends the day after
    // week N+1's window begins.
    expect(calls[0]).toEqual({
      client: "globalcomix",
      from: "2026-04-27",
      to: "2026-05-03",
    });
    expect(calls[1]).toEqual({
      client: "globalcomix",
      from: "2026-04-20",
      to: "2026-04-26",
    });
    expect(calls[2]).toEqual({
      client: "globalcomix",
      from: "2026-04-13",
      to: "2026-04-19",
    });
    expect(calls[3]).toEqual({
      client: "globalcomix",
      from: "2026-04-06",
      to: "2026-04-12",
    });
  });

  it("emits one WeeklyHistoryRow per (network, week) with derived label", async () => {
    networkBreakdownMock.mockImplementation(async () => [
      net("Meta", 100),
      net("Google", 200),
    ]);

    const rows = await fetchTrailingWeeks({
      client: "globalcomix",
      periodIsoStart: "2026-05-04",
    });

    // 4 weeks * 2 networks each = 8 rows.
    expect(rows).toHaveLength(HISTORY_WEEKS * 2);

    // Spot-check the most recent week's Meta row.
    const recentMeta = rows.find(
      (r) => r.weekIsoStart === "2026-04-27" && r.network === "Meta",
    );
    expect(recentMeta).toBeDefined();
    expect(recentMeta?.weekIsoEnd).toBe("2026-05-03");
    expect(recentMeta?.weekNumber).toBe(18);
    expect(recentMeta?.weekLabel).toMatch(/Apr 27.*to.*May 3.*Week 18/);
    expect(recentMeta?.metrics.spend).toBe(100);

    // And the oldest week.
    const oldestGoogle = rows.find(
      (r) => r.weekIsoStart === "2026-04-06" && r.network === "Google",
    );
    expect(oldestGoogle).toBeDefined();
    expect(oldestGoogle?.weekIsoEnd).toBe("2026-04-12");
    expect(oldestGoogle?.weekNumber).toBe(15);
    expect(oldestGoogle?.metrics.spend).toBe(200);
  });

  it("works for an arbitrary anchor in a different season (period-agnostic)", async () => {
    networkBreakdownMock.mockResolvedValue([net("Meta", 50)]);

    const rows = await fetchTrailingWeeks({
      client: "globalcomix",
      periodIsoStart: "2026-09-14",
    });

    expect(rows).toHaveLength(HISTORY_WEEKS);

    const calls = networkBreakdownMock.mock.calls.map(
      ([, from, to]) => ({ from, to }),
    );
    expect(calls[0]).toEqual({ from: "2026-09-07", to: "2026-09-13" });
    expect(calls[3]).toEqual({ from: "2026-08-17", to: "2026-08-23" });

    // Most recent week ending 2026-09-13 (Sun) is ISO week 37 of 2026.
    const recent = rows.find((r) => r.weekIsoEnd === "2026-09-13");
    expect(recent?.weekNumber).toBe(37);
  });

  it("supports an explicit weeks override", async () => {
    networkBreakdownMock.mockResolvedValue([net("Meta", 1)]);

    const rows = await fetchTrailingWeeks({
      client: "globalcomix",
      periodIsoStart: "2026-05-04",
      weeks: 2,
    });

    expect(networkBreakdownMock).toHaveBeenCalledTimes(2);
    expect(rows).toHaveLength(2);
  });

  it("returns [] without firing queries when the anchor is unparseable", async () => {
    const rows = await fetchTrailingWeeks({
      client: "globalcomix",
      periodIsoStart: "not-a-date",
    });

    expect(rows).toEqual([]);
    expect(networkBreakdownMock).not.toHaveBeenCalled();
  });

  it("returns [] when weeks=0", async () => {
    const rows = await fetchTrailingWeeks({
      client: "globalcomix",
      periodIsoStart: "2026-05-04",
      weeks: 0,
    });
    expect(rows).toEqual([]);
    expect(networkBreakdownMock).not.toHaveBeenCalled();
  });

  it("tolerates one trailing-week query failing", async () => {
    // First call rejects; the rest return data. We expect the rows for
    // the failed week to be silently dropped (the caller still gets the
    // other three weeks).
    let call = 0;
    networkBreakdownMock.mockImplementation(async () => {
      call += 1;
      if (call === 2) throw new Error("transient BQ outage");
      return [net("Meta", 100)];
    });

    const rows = await fetchTrailingWeeks({
      client: "globalcomix",
      periodIsoStart: "2026-05-04",
    });
    // 3 weeks * 1 network each.
    expect(rows).toHaveLength(3);
  });
});
