// @vitest-environment node
// Layer 2 (lib unit). Files under test:
//   src/lib/agents/hermes/assemble.ts
//   src/lib/agents/hermes/nodes/atelier.ts (skip path)
//
// v0.5-A chunk 4 replaced the pptxgenjs writer with a Report-row
// inserter. The pure assembleHermesReport helper carries the
// renderer-bound contract (Report shape, byline, section mapping); the
// node-level test only covers the skip paths (missing intent /
// snapshot / user_id) because the supabase write is integration-level
// and lives in the e2e squad gate.

import { describe, expect, it } from "vitest";

import { assembleHermesReport } from "@/lib/agents/hermes/assemble";
import { atelier } from "@/lib/agents/hermes/nodes/atelier";
import { buildHermesSnapshot } from "@/lib/agents/hermes/snapshot";
import type {
  Bullet,
  HermesState,
  Intent,
} from "@/lib/agents/hermes/state";
import type {
  ChannelCampaignSection,
  ChannelWeeklySection,
  PlatformOverallSection,
} from "@/lib/reports/types";
import type {
  CampaignRow as BQCampaignRow,
  NetworkRow as BQNetworkRow,
} from "@/types/dashboard";

// Synthetic BQ rows for the new buildHermesSnapshot signature.
// Real-data shape; exact numbers chosen so assertions can pin them.
function netRow(over: Partial<BQNetworkRow> = {}): BQNetworkRow {
  return {
    network: "Meta",
    spend: 5000,
    share: 0.5,
    installs: 1000,
    clicks: 20000,
    impressions: 1_000_000,
    cpi: 5,
    ctr: 0.02,
    cpm: 5,
    cpc: 0.25,
    roasD7: 0.2,
    roasD14: 0.3,
    roasD30: 0.4,
    roasD90: 0.5,
    ftdD7: 100,
    payersD7: 80,
    retD7: 0.6,
    subStart: 200,
    subD0: 50,
    subD7: 80,
    cpSubStart: 25,
    cpaD0: 100,
    cpaD7: 62.5,
    trailingCpaD7Avg: 60,
    ...over,
  };
}

function campRow(over: Partial<BQCampaignRow> = {}): BQCampaignRow {
  return {
    campaign_id: "c1",
    campaign_name: "YH_FB_APP_test",
    network: "Meta",
    spend: 1000,
    installs: 200,
    cpi: 5,
    roas: 0,
    spendDelta: 0.1,
    ...over,
  };
}

function bullet(over: Partial<Bullet> = {}): Bullet {
  return {
    claim: "Meta CPA D7 rose 18%.",
    columns_used: ["cpa_d7"],
    source_query_id: "network_breakdown",
    delta_value: 0.18,
    action_item: null,
    citations: [{ source_path: "vault/x.md", chunk_id: "abc-0" }],
    slide_target: "channel_weekly",
    ...over,
  };
}

function intent(over: Partial<Intent> = {}): Intent {
  return {
    client: "globalcomix",
    platforms: ["android"],
    channels: ["meta"],
    period: { label: "Week 19", iso_start: null, iso_end: null },
    focus: null,
    confidence: 0.9,
    doubts: [],
    ...over,
  };
}

describe("assembleHermesReport", () => {
  it("produces a Report whose sections match the manual yellowHEAD format", () => {
    const i = intent();
    const snapshot = buildHermesSnapshot({ intent: i, networks: [netRow()], campaigns: [campRow()] });
    const report = assembleHermesReport({
      intent: i,
      snapshot,
      bullets: [],
      runId: "run-abc",
      ownerUserId: "user-xyz",
    });

    expect(report.source).toBe("hermes");
    expect(report.authoredBy).toBe("hermes");
    expect(report.agentRunId).toBe("run-abc");
    expect(report.userId).toBe("user-xyz");
    expect(report.client).toBe("globalcomix");
    expect(report.clientLabel).toBe("GlobalComix");

    const ids = report.sections.map((s) => s.id);
    expect(ids).toEqual([
      "platform_overall",
      "channel_weekly",
      "channel_campaign",
    ]);
  });

  it("overlays Quill bullets onto each section keyed by slide_target", () => {
    const i = intent();
    const snapshot = buildHermesSnapshot({ intent: i, networks: [netRow()], campaigns: [campRow()] });
    const report = assembleHermesReport({
      intent: i,
      snapshot,
      bullets: [
        bullet({ slide_target: "platform_overall", claim: "Plat A" }),
        bullet({ slide_target: "platform_overall", claim: "Plat B" }),
        bullet({ slide_target: "channel_weekly", claim: "Weekly A" }),
        bullet({ slide_target: "campaign_breakdown", claim: "Camp A" }),
      ],
      runId: "run-1",
      ownerUserId: "user-1",
    });

    const plat = report.sections.find(
      (s) => s.id === "platform_overall",
    ) as PlatformOverallSection;
    expect(plat.bullets.map((b) => b.text)).toEqual(["Plat A", "Plat B"]);

    const weekly = report.sections.find(
      (s) => s.id === "channel_weekly",
    ) as ChannelWeeklySection;
    expect(weekly.bullets.map((b) => b.text)).toEqual(["Weekly A"]);

    const camp = report.sections.find(
      (s) => s.id === "channel_campaign",
    ) as ChannelCampaignSection;
    expect(camp.commentary).toHaveLength(1);
    expect(camp.commentary[0].observation).toBe("Camp A");
  });

  it("falls back to neutral tone when bullets carry no directional signal", () => {
    const i = intent();
    const snapshot = buildHermesSnapshot({ intent: i, networks: [netRow()], campaigns: [campRow()] });
    const report = assembleHermesReport({
      intent: i,
      snapshot,
      bullets: [
        bullet({
          slide_target: "channel_weekly",
          claim: "Small move",
          delta_value: 1.0,
          action_item: null,
        }),
      ],
      runId: "run-1",
      ownerUserId: "user-1",
    });

    const weekly = report.sections.find(
      (s) => s.id === "channel_weekly",
    ) as ChannelWeeklySection;
    expect(weekly.bullets[0].tone).toBeUndefined();
  });

  it("flags first bullet as headline when the signal is large or directional", () => {
    const i = intent();
    const snapshot = buildHermesSnapshot({ intent: i, networks: [netRow()], campaigns: [campRow()] });
    const report = assembleHermesReport({
      intent: i,
      snapshot,
      bullets: [
        bullet({
          slide_target: "platform_overall",
          claim: "Big move",
          delta_value: 30,
          action_item: null,
        }),
      ],
      runId: "run-1",
      ownerUserId: "user-1",
    });

    const plat = report.sections.find(
      (s) => s.id === "platform_overall",
    ) as PlatformOverallSection;
    expect(plat.bullets[0].tone).toBe("headline-bad");
  });
});

describe("atelier node skip paths", () => {
  function baseState(over: Partial<HermesState> = {}): HermesState {
    return {
      email_text: "x",
    action_notes: null as string | null,
      run_id: "run-1",
      user_id: "user-1",
      intent: intent(),
      context: { knowledge: [], history: [], comms: [] },
      snapshot: buildHermesSnapshot({ intent: intent(), networks: [netRow()], campaigns: [campRow()] }),
      contact: null,
      findings: [],
      bullets: [],
      deck: { pptx_path: null, slides: [], report_id: null },
      approval: {
        approved: false,
        approved_by: null,
        approved_at: null,
        edits: [],
      },
      history: [],
      ...over,
    };
  }

  it("skips when intent is null", async () => {
    const out = await atelier(baseState({ intent: null }));
    expect(out.deck?.report_id).toBeNull();
    expect(out.history?.[0].notes).toMatch(/missing intent/);
  });

  it("skips when snapshot is null", async () => {
    const out = await atelier(baseState({ snapshot: null }));
    expect(out.deck?.report_id).toBeNull();
    expect(out.history?.[0].notes).toMatch(/missing snapshot/);
  });

  it("skips when user_id is null", async () => {
    const out = await atelier(baseState({ user_id: null }));
    expect(out.deck?.report_id).toBeNull();
    expect(out.history?.[0].notes).toMatch(/missing user_id/);
  });
});
