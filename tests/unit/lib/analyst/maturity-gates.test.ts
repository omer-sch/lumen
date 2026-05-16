// @vitest-environment node
// Layer 2 (lib unit). Maturity-gate behavior: each gate has at least
// one test that proves it FIRES (no finding emitted when conditions
// aren't met) and one that proves it DOES NOT (finding emitted when
// they are). Per the spec: "this is the human ground truth, the test
// confirms the analyst matches it".
import { describe, expect, it } from "vitest";

import { runAnomstack } from "@/lib/analyst/anomstack";
import { cpaD7VsTrailing30d } from "@/lib/analyst/comparisons";
import {
  COHORT_D7_MATURITY_THRESHOLD,
  MIN_POPULATION,
} from "@/lib/analyst/maturity-gates";
import { topCampaignsBySpend } from "@/lib/analyst/rankings";
import type { CampaignRow, NetworkRow } from "@/types/dashboard";

function net(over: Partial<NetworkRow>): NetworkRow {
  return {
    network: "Meta", spend: 100, share: 0.1, installs: 10,
    clicks: 200, impressions: 5000,
    ftdD7: 10, subStart: 10, subD0: 8, subD7: 20,
    cpi: 10, cpSubStart: 10, cpaD0: 12.5, cpaD7: 100,
    ctr: 0.04, cpm: 20, cpc: 0.5,
    roasD7: 0.3, roasD14: 0.4, roasD30: 0.5, roasD90: 0.6,
    payersD7: 12, retD7: 0.4, trailingCpaD7Avg: 100,
    ...over,
  };
}

function camp(over: Partial<CampaignRow>): CampaignRow {
  return {
    campaign_id: "c1", campaign_name: "X", network: "Meta",
    spend: 100, installs: 10, cpi: 10, roas: 0.3, spendDelta: null,
    ...over,
  };
}

describe("MIN_POPULATION gate (z-score)", () => {
  it("FIRES: with fewer than MIN_POPULATION networks, no z-score anomaly is emitted even for an extreme outlier", () => {
    const networks = [
      net({ network: "A", spend: 100 }),
      net({ network: "B", spend: 10000 }),
    ];
    const r = runAnomstack({ networks, campaigns: [] });
    expect(r.anomalies.filter((a) => a.detector === "z_score")).toEqual([]);
    expect(MIN_POPULATION).toBeGreaterThanOrEqual(2);
  });

  it("DOES NOT fire: with enough networks and a real outlier, the z-score anomaly is emitted", () => {
    const networks = [
      net({ network: "A", spend: 100 }),
      net({ network: "B", spend: 110 }),
      net({ network: "C", spend: 90 }),
      net({ network: "D", spend: 100 }),
      net({ network: "E", spend: 110 }),
      net({ network: "F", spend: 1000, subD7: 50 }),
    ];
    const r = runAnomstack({ networks, campaigns: [] });
    const zs = r.anomalies.filter((a) => a.detector === "z_score");
    expect(zs.length).toBeGreaterThan(0);
    expect(zs.some((a) => a.network === "F")).toBe(true);
  });
});

describe("COHORT_D7_MATURITY gate", () => {
  // Synthetic distribution where cpa_d7 of the Meta row is an extreme
  // z-score outlier AND moves >25% vs trailing baseline; both detectors
  // would fire if subD7 were >= threshold. Below threshold both must be
  // suppressed.
  function cohortPopulation(metaSubD7: number) {
    return [
      net({ network: "Meta", cpaD7: 800, trailingCpaD7Avg: 200, subD7: metaSubD7 }),
      net({ network: "Google", cpaD7: 150, trailingCpaD7Avg: 148, subD7: 25 }),
      net({ network: "TikTok", cpaD7: 200, trailingCpaD7Avg: 205, subD7: 22 }),
      net({ network: "Apple", cpaD7: 180, trailingCpaD7Avg: 185, subD7: 24 }),
      net({ network: "AppLovin", cpaD7: 220, trailingCpaD7Avg: 215, subD7: 26 }),
      net({ network: "Unity Ads", cpaD7: 100, trailingCpaD7Avg: 105, subD7: 200 }),
    ];
  }

  it("FIRES: subD7 below COHORT_D7_MATURITY_THRESHOLD suppresses cpa_d7 z-score AND percent-delta anomalies on that network", () => {
    const networks = cohortPopulation(COHORT_D7_MATURITY_THRESHOLD - 1);
    const r = runAnomstack({ networks, campaigns: [] });
    // No cpa_d7 anomaly for Meta from either detector.
    expect(
      r.anomalies.filter((a) => a.metric === "cpa_d7" && a.network === "Meta"),
    ).toEqual([]);
    // The suppression counter reports >=1 (z-score + percent-delta on Meta).
    expect(r.counts.suppressed_by_cohort_gate).toBeGreaterThanOrEqual(1);
  });

  it("DOES NOT fire: subD7 at or above threshold lets cpa_d7 anomalies through", () => {
    const networks = cohortPopulation(COHORT_D7_MATURITY_THRESHOLD);
    const r = runAnomstack({ networks, campaigns: [] });
    expect(
      r.anomalies.filter((a) => a.metric === "cpa_d7" && a.network === "Meta")
        .length,
    ).toBeGreaterThan(0);
    expect(r.counts.suppressed_by_cohort_gate).toBe(0);
  });
});

describe("Rankings partial flag", () => {
  it("FIRES: requesting top-5 with only 3 spending campaigns returns 3 rows and partial=true", () => {
    const campaigns = [
      camp({ campaign_id: "a", spend: 300 }),
      camp({ campaign_id: "b", spend: 200 }),
      camp({ campaign_id: "c", spend: 100 }),
      camp({ campaign_id: "d", spend: 0 }),
    ];
    const r = topCampaignsBySpend(campaigns, 5);
    expect(r.actualN).toBe(3);
    expect(r.requestedN).toBe(5);
    expect(r.partial).toBe(true);
    expect(r.rows.map((c) => c.campaign_id)).toEqual(["a", "b", "c"]);
  });

  it("DOES NOT fire: requesting top-3 with 5 campaigns returns 3 rows and partial=false", () => {
    const campaigns = [
      camp({ campaign_id: "a", spend: 300 }),
      camp({ campaign_id: "b", spend: 200 }),
      camp({ campaign_id: "c", spend: 100 }),
      camp({ campaign_id: "d", spend: 50 }),
      camp({ campaign_id: "e", spend: 25 }),
    ];
    const r = topCampaignsBySpend(campaigns, 3);
    expect(r.actualN).toBe(3);
    expect(r.partial).toBe(false);
  });
});

describe("Comparisons cohort maturity (cpaD7VsTrailing30d)", () => {
  it("FIRES: an immature row is returned with mature=false and a documented maturityReason", () => {
    const networks = [
      net({ network: "Young", cpaD7: 300, trailingCpaD7Avg: 200, subD7: 3 }),
    ];
    const pop = cpaD7VsTrailing30d(networks);
    expect(pop[0].mature).toBe(false);
    expect(pop[0].maturityReason).toMatch(/below maturity threshold/);
    expect(pop[0].tone).toBe("neutral");
  });

  it("DOES NOT fire: a mature row crossing the percent-delta threshold gets tone='bad' for a cost rise", () => {
    const networks = [
      net({ network: "Mature", cpaD7: 300, trailingCpaD7Avg: 200, subD7: 50 }),
    ];
    const pop = cpaD7VsTrailing30d(networks);
    expect(pop[0].mature).toBe(true);
    expect(pop[0].tone).toBe("bad"); // up on cost metric is bad
    expect(pop[0].deltaPct).toBeCloseTo(0.5, 5);
  });

  it("flips tone='good' for a cost drop that crosses threshold and is mature", () => {
    const networks = [
      net({ network: "Mature", cpaD7: 100, trailingCpaD7Avg: 200, subD7: 50 }),
    ];
    const pop = cpaD7VsTrailing30d(networks);
    expect(pop[0].mature).toBe(true);
    expect(pop[0].tone).toBe("good");
  });
});
