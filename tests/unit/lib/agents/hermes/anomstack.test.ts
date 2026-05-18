// Layer 2 (lib unit). File under test:
// src/lib/analyst/anomstack.ts (moved from
// src/lib/agents/hermes/anomstack.ts in the shared-analyst PR).
// Pure function over typed inputs; tests are straightforward synthetic
// fixtures. The anomalies-array shape is preserved verbatim from the
// pre-move file, so every assertion below still holds; new assertions
// for the AnalystFinding lift live in tests/unit/lib/analyst/.
import { describe, expect, it } from "vitest";

import {
  PCT_DELTA_THRESHOLD,
  Z_THRESHOLD,
  runAnomstack,
} from "@/lib/analyst/anomstack";
import type { CampaignRow, NetworkRow } from "@/types/dashboard";

function makeNetwork(over: Partial<NetworkRow>): NetworkRow {
  // Default subD7=20 keeps the test population above the
  // COHORT_D7_MATURITY_THRESHOLD (10) so the cpa_d7 detectors fire
  // without per-row overrides. Tests that want to exercise the
  // suppression path pass subD7 explicitly.
  return {
    network: "meta",
    spend: 1000,
    share: 0.5,
    installs: 100,
    clicks: 1000,
    impressions: 10000,
    cpi: 10,
    ctr: 0.1,
    cpm: 5,
    cpc: 0.5,
    roasD7: 0.3,
    roasD14: 0.4,
    roasD30: 0.5,
    roasD90: 0.6,
    ftdD7: 5,
    payersD7: 5,
    retD7: 0.2,
    subStart: 10,
    subD0: 8,
    subD7: 20,
    cpSubStart: 100,
    cpaD0: 125,
    cpaD7: 200,
    trailingCpaD7Avg: 200,
    ...over,
  };
}

function makeCampaign(over: Partial<CampaignRow>): CampaignRow {
  return {
    campaign_id: "c1",
    campaign_name: "Test",
    network: "meta",
    spend: 100,
    installs: 10,
    cpi: 10,
    roi_d7: 0.5,
    spendDelta: 0,
    ...over,
  };
}

describe("runAnomstack — z-score detector", () => {
  it("flags a high-spend outlier across networks", () => {
    const networks = [
      makeNetwork({ network: "meta", spend: 100 }),
      makeNetwork({ network: "google", spend: 110 }),
      makeNetwork({ network: "tiktok", spend: 90 }),
      makeNetwork({ network: "asa", spend: 100 }),
      makeNetwork({ network: "n5", spend: 110 }),
      makeNetwork({ network: "outlier", spend: 1000 }), // tight base + big outlier
    ];
    const r = runAnomstack({ networks, campaigns: [] });
    const spendAnomalies = r.anomalies.filter(
      (a) => a.detector === "z_score" && a.metric === "spend",
    );
    expect(spendAnomalies.length).toBeGreaterThan(0);
    expect(spendAnomalies[0].network).toBe("outlier");
    expect(Math.abs(spendAnomalies[0].score)).toBeGreaterThan(Z_THRESHOLD);
  });

  it("flags a low-CPI outlier with direction=down", () => {
    const networks = [
      makeNetwork({ network: "meta", cpi: 10 }),
      makeNetwork({ network: "google", cpi: 9 }),
      makeNetwork({ network: "tiktok", cpi: 11 }),
      makeNetwork({ network: "n4", cpi: 10 }),
      makeNetwork({ network: "n5", cpi: 9.5 }),
      makeNetwork({ network: "outlier", cpi: 0.5 }), // very low outlier
    ];
    const r = runAnomstack({ networks, campaigns: [] });
    const cpiAnomalies = r.anomalies.filter(
      (a) => a.detector === "z_score" && a.metric === "cpi",
    );
    expect(cpiAnomalies.some((a) => a.direction === "down")).toBe(true);
  });

  it("does not flag when the population is too small", () => {
    const networks = [
      makeNetwork({ network: "meta", spend: 1000 }),
      makeNetwork({ network: "google", spend: 100 }),
    ];
    const r = runAnomstack({ networks, campaigns: [] });
    expect(r.anomalies.filter((a) => a.detector === "z_score")).toEqual([]);
  });

  it("does not flag when stdev is zero (all equal)", () => {
    const networks = [
      makeNetwork({ network: "meta", spend: 1000 }),
      makeNetwork({ network: "google", spend: 1000 }),
      makeNetwork({ network: "tiktok", spend: 1000 }),
      makeNetwork({ network: "asa", spend: 1000 }),
    ];
    const r = runAnomstack({ networks, campaigns: [] });
    expect(r.anomalies.filter((a) => a.detector === "z_score")).toEqual([]);
  });
});

describe("runAnomstack — percent-delta detectors", () => {
  it("flags a network whose CPA D7 has moved past the threshold vs its trailing baseline", () => {
    const networks = [
      makeNetwork({ network: "meta", cpaD7: 300, trailingCpaD7Avg: 200 }), // +50%
      makeNetwork({ network: "google", cpaD7: 195, trailingCpaD7Avg: 200 }), // -2.5% (below threshold)
    ];
    const r = runAnomstack({ networks, campaigns: [] });
    const cpaDeltas = r.anomalies.filter(
      (a) => a.detector === "percent_delta" && a.metric === "cpa_d7",
    );
    expect(cpaDeltas).toHaveLength(1);
    expect(cpaDeltas[0].network).toBe("meta");
    expect(cpaDeltas[0].direction).toBe("up");
    expect(Math.abs(cpaDeltas[0].score)).toBeGreaterThan(PCT_DELTA_THRESHOLD);
  });

  it("skips networks with no trailing baseline (avg=0)", () => {
    const networks = [
      makeNetwork({ network: "meta", cpaD7: 300, trailingCpaD7Avg: 0 }),
    ];
    const r = runAnomstack({ networks, campaigns: [] });
    expect(
      r.anomalies.filter(
        (a) => a.detector === "percent_delta" && a.metric === "cpa_d7",
      ),
    ).toEqual([]);
  });

  it("flags a campaign whose spend moved more than the threshold", () => {
    const campaigns = [
      makeCampaign({
        campaign_id: "c1",
        campaign_name: "Big mover",
        spendDelta: 0.5,
      }),
      makeCampaign({
        campaign_id: "c2",
        campaign_name: "Quiet",
        spendDelta: 0.1,
      }),
    ];
    const r = runAnomstack({ networks: [], campaigns });
    const campaignDeltas = r.anomalies.filter(
      (a) => a.detector === "percent_delta" && a.source_query_id === "campaigns",
    );
    expect(campaignDeltas).toHaveLength(1);
    expect(campaignDeltas[0].campaign_name).toBe("Big mover");
  });

  it("returns counts that match the anomaly category split", () => {
    const networks = [
      makeNetwork({ network: "meta", spend: 100 }),
      makeNetwork({ network: "google", spend: 110 }),
      makeNetwork({ network: "tiktok", spend: 90 }),
      makeNetwork({ network: "n4", spend: 100 }),
      makeNetwork({ network: "n5", spend: 105 }),
      makeNetwork({ network: "outlier", spend: 1000 }),
    ];
    const campaigns = [
      makeCampaign({
        campaign_id: "c1",
        campaign_name: "Mover",
        spendDelta: 0.5,
      }),
    ];
    const r = runAnomstack({ networks, campaigns });
    expect(r.counts.z_score).toBeGreaterThan(0);
    expect(r.counts.percent_delta_campaign).toBe(1);
    expect(r.anomalies.length).toBe(
      r.counts.z_score +
        r.counts.percent_delta_network +
        r.counts.percent_delta_campaign,
    );
  });

  it("returns empty results for empty input", () => {
    const r = runAnomstack({ networks: [], campaigns: [] });
    expect(r.anomalies).toEqual([]);
    expect(r.counts).toEqual({
      z_score: 0,
      percent_delta_network: 0,
      percent_delta_campaign: 0,
      suppressed_by_cohort_gate: 0,
    });
  });
});
