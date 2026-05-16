// @vitest-environment node
// Layer 2 (lib unit). File under test: src/lib/agents/hermes/snapshot.ts.
//
// This is the trust-contract test for the snapshot rewrite: the values
// the deck renders MUST come from the BQ rows Analyze feeds in, not
// from any hardcoded fixture. The pre-rewrite version of this file
// would have failed each of these assertions because every run got
// the same $6,230 / -28.7% mock row.

import { describe, expect, it } from "vitest";

import { buildHermesSnapshot } from "@/lib/agents/hermes/snapshot";
import type { Intent } from "@/lib/agents/hermes/state";
import type {
  CampaignRow as BQCampaignRow,
  NetworkRow as BQNetworkRow,
} from "@/types/dashboard";

function intent(over: Partial<Intent> = {}): Intent {
  return {
    client: "globalcomix",
    platforms: ["ios"],
    channels: ["tiktok"],
    period: { label: "last 7 days", iso_start: null, iso_end: null },
    focus: null,
    confidence: 0.92,
    doubts: [],
    ...over,
  };
}

function net(over: Partial<BQNetworkRow>): BQNetworkRow {
  return {
    network: "Meta",
    spend: 0,
    share: 0,
    installs: 0,
    clicks: 0,
    impressions: 0,
    cpi: 0,
    ctr: 0,
    cpm: 0,
    cpc: 0,
    roasD7: 0,
    roasD14: 0,
    roasD30: 0,
    roasD90: 0,
    ftdD7: 0,
    payersD7: 0,
    retD7: 0,
    subStart: 0,
    subD0: 0,
    subD7: 0,
    cpSubStart: 0,
    cpaD0: 0,
    cpaD7: 0,
    trailingCpaD7Avg: 0,
    ...over,
  };
}

function camp(over: Partial<BQCampaignRow>): BQCampaignRow {
  return {
    campaign_id: "c1",
    campaign_name: "test",
    network: "Meta",
    spend: 0,
    installs: 0,
    cpi: 0,
    roas: 0,
    spendDelta: null,
    ...over,
  };
}

describe("buildHermesSnapshot (real-data path)", () => {
  it("returns one platformOverall row per BQ network with the BQ values verbatim", () => {
    const networks: BQNetworkRow[] = [
      net({ network: "TikTok", spend: 4321, subStart: 50, cpaD7: 12.5 }),
      net({ network: "Facebook", spend: 9876, subStart: 100, cpaD7: 30 }),
    ];
    const snap = buildHermesSnapshot({
      intent: intent({ channels: ["tiktok"] }),
      networks,
      campaigns: [],
    });
    expect(snap.platformOverall).not.toBeNull();
    const rows = snap.platformOverall!.rows;
    expect(rows.map((r) => r.label).sort()).toEqual(["Facebook", "TikTok"]);
    const tt = rows.find((r) => r.label === "TikTok")!;
    expect(tt.spend.value).toBe(4321);
    expect(tt.substart.value).toBe(50);
    expect(tt.cpaD7.value).toBe(12.5);
    // Crucial: none of the deleted-mock values leaked through.
    expect(rows.find((r) => r.spend.value === 6230)).toBeUndefined();
    expect(
      rows.find((r) =>
        typeof r.substart.delta === "number" ? r.substart.delta === -28.7 : false,
      ),
    ).toBeUndefined();
  });

  it("omits networks BQ does not return rather than substituting mock fixtures", () => {
    const networks: BQNetworkRow[] = [
      net({ network: "TikTok", spend: 100, cpaD7: 10 }),
    ];
    const snap = buildHermesSnapshot({
      intent: intent(),
      networks,
      campaigns: [],
    });
    expect(snap.platformOverall!.rows).toHaveLength(1);
    expect(snap.platformOverall!.rows[0].label).toBe("TikTok");
    // No Facebook / Google rows fabricated.
  });

  it("derives cpaD7 delta from trailingCpaD7Avg and tones it (rise = bad on a cost metric)", () => {
    // subD7 > 0 so the maturing-window guard does not suppress the
    // delta; both spend and trailing baseline are real.
    const networks: BQNetworkRow[] = [
      net({
        network: "Meta",
        spend: 1000,
        subD7: 13,
        cpaD7: 75,
        trailingCpaD7Avg: 50,
      }),
    ];
    const snap = buildHermesSnapshot({
      intent: intent({ channels: ["meta"] }),
      networks,
      campaigns: [],
    });
    const row = snap.platformOverall!.rows[0];
    expect(row.cpaD7.delta).toBe(50); // (75 - 50) / 50 = +50%
    expect(row.cpaD7.tone).toBe("bad"); // cost rose
  });

  it("suppresses cpaD7 delta + tone when subD7 has not matured (no false-good)", () => {
    // The bug this test pins: subD7 = 0 (cohort not matured for "this
    // past week") collapses cpaD7 to 0 via SAFE_DIVIDE; without the
    // guard the delta computes -100% vs the trailing baseline and the
    // row tones "good" (cost dropped, GOOD!) when in reality the data
    // isn't there yet.
    const networks: BQNetworkRow[] = [
      net({
        network: "Meta",
        spend: 5000,
        subStart: 100,
        subD0: 25,
        subD7: 0, // not matured
        cpaD7: 0, // collapses to 0
        trailingCpaD7Avg: 60,
      }),
    ];
    const snap = buildHermesSnapshot({
      intent: intent({ channels: ["meta"] }),
      networks,
      campaigns: [],
    });
    const row = snap.platformOverall!.rows[0];
    expect(row.cpaD7.value).toBe(0);
    expect(row.cpaD7.delta).toBeUndefined();
    expect(row.cpaD7.tone).toBe("neutral");
    expect(row.cpaD7.maturing).toBe(true);
    // Totals row inherits the same guard.
    expect(snap.platformOverall!.total.cpaD7.delta).toBeUndefined();
    expect(snap.platformOverall!.total.cpaD7.tone).toBe("neutral");
  });

  it("marks dataScope as client-wide-all-platforms (BQ has no platform filter today)", () => {
    const snap = buildHermesSnapshot({
      intent: intent({ platforms: ["ios"] }),
      networks: [net({ network: "Meta", spend: 100 })],
      campaigns: [],
    });
    expect(snap.dataScope).toBe("client-wide-all-platforms");
  });

  it("leaves volume-metric deltas undefined when there's no prior-period BQ data", () => {
    const networks: BQNetworkRow[] = [
      net({ network: "Meta", subStart: 100, subD0: 25, trailingCpaD7Avg: 0 }),
    ];
    const snap = buildHermesSnapshot({
      intent: intent({ channels: ["meta"] }),
      networks,
      campaigns: [],
    });
    const row = snap.platformOverall!.rows[0];
    expect(row.substart.delta).toBeUndefined();
    expect(row.subD0.delta).toBeUndefined();
  });

  it("scopes channelWeekly + channelCampaign to the intent's primary channel only", () => {
    const networks: BQNetworkRow[] = [
      net({ network: "Meta", spend: 1000, cpaD7: 50 }),
      net({ network: "TikTok", spend: 500, cpaD7: 80 }),
    ];
    const campaigns: BQCampaignRow[] = [
      camp({ campaign_id: "m1", network: "Meta", spend: 700 }),
      camp({ campaign_id: "t1", network: "TikTok", spend: 300 }),
    ];
    const snap = buildHermesSnapshot({
      intent: intent({ channels: ["tiktok"] }),
      networks,
      campaigns,
    });
    expect(snap.channelWeekly!.currentWeek.label).toBe("TikTok");
    expect(snap.channelCampaign!.rows).toHaveLength(1);
    expect(snap.channelCampaign!.rows[0].campaignName).toBe("test");
    expect(snap.channelCampaign!.rows[0].spend).toBe(300);
  });

  it("returns all-null sections when BQ has zero rows (no fabricated data)", () => {
    const snap = buildHermesSnapshot({
      intent: intent(),
      networks: [],
      campaigns: [],
    });
    expect(snap.platformOverall).toBeNull();
    expect(snap.channelWeekly).toBeNull();
    expect(snap.channelCampaign).toBeNull();
  });

  it("returns null channelWeekly when the intent's channel had no spend in BQ", () => {
    // Networks exist but not the one the intent asks for.
    const networks: BQNetworkRow[] = [
      net({ network: "Meta", spend: 1000 }),
    ];
    const snap = buildHermesSnapshot({
      intent: intent({ channels: ["tiktok"] }),
      networks,
      campaigns: [],
    });
    expect(snap.platformOverall).not.toBeNull(); // platform overall still renders
    expect(snap.channelWeekly).toBeNull(); // but the per-channel slice is gone
    expect(snap.channelCampaign).toBeNull();
  });
});
