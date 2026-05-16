// @vitest-environment node
// Layer 2 (lib unit). Verifies that composeReport forwards
// options.actionNotes to the campaign-breakdown writer's <actions>
// context block in the user message, so the prose-writer can weave
// `<> AI:` callouts into the matching family's paragraph.

import { beforeEach, describe, expect, it, vi } from "vitest";

const messagesCreateMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/agents/_scaffold/model", () => ({
  getAnthropicClient: () => ({
    messages: { create: messagesCreateMock },
  }),
  pickModel: () => "claude-sonnet-fake",
}));

vi.mock("@/lib/cache/redis", () => ({
  cacheEnabled: () => false,
  redis: null,
}));

import { composeReport } from "@/lib/smart-reports";
import type { Intent, ReadyData } from "@/lib/analyst/types";

const intent: Intent = {
  client: "globalcomix",
  platforms: ["android"],
  channels: ["meta"],
  period: {
    label: "last 7 days",
    iso_start: "2026-05-01",
    iso_end: "2026-05-07",
  },
  focus: null,
  confidence: 1,
  doubts: [],
};

function ready(): ReadyData {
  return {
    intent,
    clientLabel: "GlobalComix",
    period: {
      label: "last 7 days",
      isoStart: "2026-05-01",
      isoEnd: "2026-05-07",
    },
    networks: [makeNetwork("Meta")],
    campaigns: [makeCampaign("Sub Evergreen", "WW-Top", "Meta")],
    trend: [],
    history: { networks: [] },
    anomalies: [],
    rankings: {
      topCampaignsBySpend: {
        rows: [],
        requestedN: 5,
        actualN: 0,
        partial: true,
      },
    },
    comparisons: { cpaD7PoP: [] },
    knowledgeChunks: [],
    provenance: {
      queryIds: ["network-breakdown", "campaigns", "trend", "data-as-of"],
      cacheKey: "k",
      fetchedAt: "2026-05-16T12:00:00.000Z",
      bqCacheAgeSeconds: 100,
    },
  };
}

function makeNetwork(name: string) {
  return {
    network: name,
    spend: 1000,
    share: 0.5,
    installs: 100,
    clicks: 5000,
    impressions: 100000,
    cpi: 10,
    ctr: 0.05,
    cpm: 10,
    cpc: 0.2,
    roasD7: 0.3,
    roasD14: 0.35,
    roasD30: 0.4,
    roasD90: 0.45,
    ftdD7: 30,
    payersD7: 25,
    retD7: 0.4,
    subStart: 50,
    subD0: 30,
    subD7: 25,
    cpSubStart: 20,
    cpaD0: 33.33,
    cpaD7: 40,
    trailingCpaD7Avg: 35,
  };
}

function makeCampaign(family: string, geo: string, network: string) {
  return {
    campaign_id: `c-${family}-${geo}`,
    campaign_name: `YH_FB_APP_FULL_IAP_${family.replace(" ", "_")}_Android_${geo}`,
    network,
    spend: 800,
    installs: 80,
    cpi: 10,
    roas: 0.3,
    spendDelta: 0.1,
    family,
    geo,
    campaignType: "Evergreen",
    platform: "Android",
  };
}

function toolResp(name: string, input: unknown) {
  return {
    content: [{ type: "tool_use", name, input }],
    usage: { input_tokens: 50, output_tokens: 20 },
  };
}

beforeEach(() => {
  messagesCreateMock.mockReset();
});

describe("composeReport with actionNotes", () => {
  it("forwards actionNotes into the campaign-breakdown writer's user message", async () => {
    messagesCreateMock
      .mockResolvedValueOnce(
        toolResp("write_weekly_breakdown", {
          bullets: [
            { text: "Meta declined [cite:network-breakdown]" },
            { text: "Top-Geos drove the drop [cite:network-breakdown]" },
          ],
          bottomLine: "Pause Top-Geos.",
        }),
      )
      .mockResolvedValueOnce(
        toolResp("write_campaign_breakdown", {
          blocks: [
            {
              heading: "Sub Evergreen",
              bullets: [
                { text: "WW-Top delivered well [cite:campaigns]" },
                { text: "India held steady [cite:campaigns]" },
              ],
              bottomLine: "Keep WW; watch India.",
              actionItem: "We added fresh creatives to WW-Top.",
            },
          ],
        }),
      );

    const composed = await composeReport({
      readyData: ready(),
      intent,
      ownerUserId: "test-user",
      options: {
        template: "single-channel-weekly",
        actionNotes: "We added fresh creatives to the WW-Top Sub Evergreen.",
      },
    });

    const campaignCall = messagesCreateMock.mock.calls.find((args) => {
      const tools = (args[0] as { tools?: { name: string }[] }).tools ?? [];
      return tools.some((t) => t.name === "write_campaign_breakdown");
    });
    expect(campaignCall).toBeDefined();
    const userMsg = (campaignCall![0] as {
      messages: { role: string; content: string }[];
    }).messages[0].content;
    expect(userMsg).toContain("<actions>");
    expect(userMsg).toContain("Family: Sub Evergreen");
    expect(userMsg).toContain(
      "- We added fresh creatives to the WW-Top Sub Evergreen.",
    );

    // The campaign-breakdown writer surfaces matching actions via the
    // structured `actionItem` field on the block, not inline.
    const campaign = composed.report.sections.find(
      (s) => s.id === "channel_campaign",
    );
    if (campaign && campaign.id === "channel_campaign") {
      expect(campaign.prose?.[0].actionItem).toBe(
        "We added fresh creatives to WW-Top.",
      );
    }
  });

  it("omits the <actions> block when actionNotes is empty / undefined", async () => {
    messagesCreateMock
      .mockResolvedValueOnce(
        toolResp("write_weekly_breakdown", {
          bullets: [
            { text: "Meta stable [cite:network-breakdown]" },
            { text: "ROAS holding [cite:network-breakdown]" },
          ],
          bottomLine: "Hold pacing.",
        }),
      )
      .mockResolvedValueOnce(
        toolResp("write_campaign_breakdown", {
          blocks: [
            {
              heading: "Sub Evergreen",
              bullets: [
                { text: "Stable [cite:campaigns]" },
                { text: "Steady performance [cite:campaigns]" },
              ],
              bottomLine: "No changes needed.",
            },
          ],
        }),
      );

    await composeReport({
      readyData: ready(),
      intent,
      ownerUserId: "test-user",
      options: { template: "single-channel-weekly" },
    });

    const campaignCall = messagesCreateMock.mock.calls.find((args) => {
      const tools = (args[0] as { tools?: { name: string }[] }).tools ?? [];
      return tools.some((t) => t.name === "write_campaign_breakdown");
    });
    const userMsg = (campaignCall![0] as {
      messages: { role: string; content: string }[];
    }).messages[0].content;
    expect(userMsg).not.toContain("<actions>");
  });
});
