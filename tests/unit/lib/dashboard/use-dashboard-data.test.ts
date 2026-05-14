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
