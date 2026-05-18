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
    roi_d7: 0,
    spendDelta: null,
    ...over,
  };
}

describe("buildHermesSnapshot (real-data path)", () => {
  it("returns one platformOverall row per BQ network with the BQ values verbatim", () => {
    // subD7 set above the cohort-maturity threshold (10) so cpaD7 is
    // emitted as a real value, not suppressed by the maturity gate.
    const networks: BQNetworkRow[] = [
      net({
        network: "TikTok",
        spend: 4321,
        subStart: 50,
        subD7: 25,
        cpaD7: 12.5,
      }),
      net({
        network: "Facebook",
        spend: 9876,
        subStart: 100,
        subD7: 40,
        cpaD7: 30,
      }),
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

  it("suppresses cpaD7 (value=null, no delta, neutral tone) when subD7 is below the maturity threshold", () => {
    // The bug this pins: a small subD7 (recent period, cohort still
    // open) makes spend / subD7 a four-figure outlier ($21k per
    // acquisition on $4k spend). The renderer reads it as real and a
    // CSM sees "catastrophic costs". The threshold (10 sub_d7) is
    // tunable in snapshot.ts; below it we emit null + maturing so
    // the cell renders as "—" with no delta arrow.
    const networks: BQNetworkRow[] = [
      net({
        network: "Meta",
        spend: 5000,
        subStart: 100,
        subD0: 25,
        subD7: 2, // below the threshold of 10
        cpaD7: 2500, // would render as "$2,500 per sub" without the guard
        trailingCpaD7Avg: 60,
      }),
    ];
    const snap = buildHermesSnapshot({
      intent: intent({ channels: ["meta"] }),
      networks,
      campaigns: [],
    });
    const row = snap.platformOverall!.rows[0];
    expect(row.cpaD7.value).toBeNull();
    expect(row.cpaD7.delta).toBeUndefined();
    expect(row.cpaD7.tone).toBe("neutral");
    expect(row.cpaD7.maturing).toBe(true);
    // Totals row inherits the same guard via the SUM of subD7.
    expect(snap.platformOverall!.total.cpaD7.value).toBeNull();
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

  it("projects ReadyData.history into channelWeekly.history for the active channel only", () => {
    // Three trailing weeks across two networks. Only the TikTok rows
    // should land in channelWeekly.history when the intent's channel
    // is tiktok; the Meta rows go to other sections (or nowhere, for
    // an intent that doesn't include Meta).
    const trailing = [
      {
        network: "TikTok",
        weekIsoStart: "2026-04-13",
        weekIsoEnd: "2026-04-19",
        weekNumber: 16,
        weekLabel: "Apr 13 to Apr 19 (Week 16)",
        metrics: net({
          network: "TikTok",
          spend: 1500,
          subStart: 50,
          subD7: 25,
          cpaD7: 60,
        }),
      },
      {
        network: "TikTok",
        weekIsoStart: "2026-04-20",
        weekIsoEnd: "2026-04-26",
        weekNumber: 17,
        weekLabel: "Apr 20 to Apr 26 (Week 17)",
        metrics: net({
          network: "TikTok",
          spend: 1800,
          subStart: 60,
          subD7: 30,
          cpaD7: 60,
        }),
      },
      // Meta row: should NOT appear in channelWeekly.history for a
      // tiktok-scoped intent.
      {
        network: "Meta",
        weekIsoStart: "2026-04-20",
        weekIsoEnd: "2026-04-26",
        weekNumber: 17,
        weekLabel: "Apr 20 to Apr 26 (Week 17)",
        metrics: net({
          network: "Meta",
          spend: 9000,
          subStart: 100,
          subD7: 40,
          cpaD7: 225,
        }),
      },
    ];
    const networks: BQNetworkRow[] = [
      net({ network: "TikTok", spend: 2000, subStart: 70, subD7: 35, cpaD7: 57 }),
    ];

    const snap = buildHermesSnapshot({
      intent: intent({ channels: ["tiktok"] }),
      networks,
      campaigns: [],
      history: trailing,
    });

    expect(snap.channelWeekly).not.toBeNull();
    expect(snap.channelWeekly?.history).toHaveLength(2);
    // Oldest-first ordering.
    expect(snap.channelWeekly?.history?.[0].label).toBe("Week 16");
    expect(snap.channelWeekly?.history?.[1].label).toBe("Week 17");
    // No Meta row leaks in.
    expect(
      snap.channelWeekly?.history?.find((r) =>
        r.range.includes("Apr 20") && r.spend === 9000,
      ),
    ).toBeUndefined();
  });

  it("suppresses subD7/cpaD7 in a history row when subD7 is below the cohort-maturity threshold", () => {
    const trailing = [
      {
        network: "TikTok",
        weekIsoStart: "2026-04-13",
        weekIsoEnd: "2026-04-19",
        weekNumber: 16,
        weekLabel: "Apr 13 to Apr 19 (Week 16)",
        metrics: net({
          network: "TikTok",
          spend: 1500,
          subStart: 50,
          subD7: 3, // below COHORT_D7_MATURITY_THRESHOLD (10)
          cpaD7: 500, // artifact value; must NOT make it to the deck
        }),
      },
    ];
    const networks: BQNetworkRow[] = [
      net({ network: "TikTok", spend: 2000, subStart: 70, subD7: 35, cpaD7: 57 }),
    ];

    const snap = buildHermesSnapshot({
      intent: intent({ channels: ["tiktok"] }),
      networks,
      campaigns: [],
      history: trailing,
    });

    const row = snap.channelWeekly?.history?.[0];
    expect(row?.subD7).toBeNull();
    expect(row?.cpaD7).toBeNull();
  });
});
