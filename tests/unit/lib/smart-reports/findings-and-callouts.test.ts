// @vitest-environment node
// Verifies two cross-cutting behaviours of the prose-writer:
//   1. ReadyData.anomalies are surfaced to the writer as a <findings>
//      block so the writer leads with deterministic detections instead
//      of re-deriving from raw rows (WS3).
//   2. The campaign-breakdown writer receives pre-picked callout
//      colors so its bullets can wrap matching phrases in
//      {{pink}}/{{orange}}/{{blue}} markup, and the section's rows
//      pick up the matching `highlight` field (WS5).

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
import type { AnalystFinding, Intent, ReadyData } from "@/lib/analyst/types";

function networkRow(network: string, spend: number) {
  return {
    network,
    spend,
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

function metaAnomaly(): AnalystFinding {
  return {
    id: "anom-cpa-meta",
    kind: "anomaly",
    severity: "high",
    summary: "Meta CPA D7 jumped 32% vs trailing 30-day baseline",
    details: { network: "Meta", metric: "cpa_d7", direction: "up" },
    provenance: {
      algorithm: "anomstack/percent-delta@1.0",
      inputs: { value: 53, baseline: 40 },
      queryIds: ["network-breakdown"],
      computedAt: "2026-05-16T12:00:00.000Z",
    },
  };
}

function makeReadyData(): ReadyData {
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
  return {
    intent,
    clientLabel: "GlobalComix",
    period: {
      label: "last 7 days",
      isoStart: "2026-05-01",
      isoEnd: "2026-05-07",
    },
    networks: [networkRow("Meta", 1000)],
    campaigns: [
      {
        campaign_id: "c-top",
        campaign_name: "YH_FB_APP_FULL_IAP_Sub_Android_Evergreen_WW-Top",
        network: "Meta",
        spend: 700,
        installs: 70,
        cpi: 10,
        roas: 0.3,
        spendDelta: 0.327,
        family: "Sub Evergreen",
        geo: "WW-Top",
        campaignType: "Evergreen",
        platform: "Android",
      },
      {
        campaign_id: "c-india",
        campaign_name: "YH_FB_APP_FULL_IAP_SubStart_Android_Evergreen_India",
        network: "Meta",
        spend: 200,
        installs: 30,
        cpi: 6.67,
        roas: 0.4,
        spendDelta: -0.233,
        family: "SubStart Evergreen",
        geo: "India",
        campaignType: "Evergreen",
        platform: "Android",
      },
      {
        campaign_id: "c-other",
        campaign_name: "YH_FB_APP_FULL_IAP_Sub_Android_Evergreen_Other",
        network: "Meta",
        spend: 100,
        installs: 10,
        cpi: 10,
        roas: 0.2,
        spendDelta: 0.05,
        family: "Sub Evergreen",
        geo: "Other",
        campaignType: "Evergreen",
        platform: "Android",
      },
    ],
    trend: [],
    history: { networks: [] },
    anomalies: [metaAnomaly()],
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

function toolResp(name: string, input: unknown) {
  return {
    content: [{ type: "tool_use", name, input }],
    usage: { input_tokens: 60, output_tokens: 20 },
  };
}

beforeEach(() => {
  messagesCreateMock.mockReset();
  delete process.env.ANTHROPIC_API_KEY;
});

describe("findings + callouts", () => {
  it("renders the analyst's anomalies into the writer's user message", async () => {
    messagesCreateMock
      .mockResolvedValueOnce(
        toolResp("write_platform_overall", {
          blocks: [
            {
              heading: "Facebook",
              bullets: [
                { text: "Meta CPA up [cite:network-breakdown]" },
                { text: "Spend down [cite:network-breakdown]" },
              ],
              bottomLine: "Pause Top-Geos.",
            },
          ],
        }),
      )
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
                {
                  text:
                    "The {{pink}}WW-Top campaign{{/pink}} saw CPA climb [cite:campaigns]",
                },
                { text: "Other geos held steady [cite:campaigns]" },
              ],
              bottomLine: "Pause Top-Geos.",
            },
          ],
        }),
      );

    const composed = await composeReport({
      readyData: makeReadyData(),
      intent: makeReadyData().intent,
      ownerUserId: "test-user",
      options: { template: "weekly-review-globalcomix" },
    });

    // Each writer call's user message should carry the <findings>
    // block when a relevant anomaly applies to its scope.
    const callsWithFindings = messagesCreateMock.mock.calls.filter((args) => {
      const userMsg = (args[0] as {
        messages: { role: string; content: string }[];
      }).messages[0].content;
      return userMsg.includes("<findings>");
    });
    expect(callsWithFindings.length).toBeGreaterThan(0);
    for (const call of callsWithFindings) {
      const userMsg = (call[0] as {
        messages: { role: string; content: string }[];
      }).messages[0].content;
      expect(userMsg).toContain("anomstack/percent-delta");
      expect(userMsg).toContain("[high]");
      expect(userMsg).toContain(
        "Meta CPA D7 jumped 32% vs trailing 30-day baseline",
      );
    }

    // And the campaign-breakdown call includes the pre-picked
    // callout color assignments so the writer can wrap bullet phrases.
    const campaignCall = messagesCreateMock.mock.calls.find((args) => {
      const tools = (args[0] as { tools?: { name: string }[] }).tools ?? [];
      return tools.some((t) => t.name === "write_campaign_breakdown");
    });
    expect(campaignCall).toBeDefined();
    const campaignUserMsg = (campaignCall![0] as {
      messages: { role: string; content: string }[];
    }).messages[0].content;
    expect(campaignUserMsg).toContain("Callout assignments");
    // Highest |spendDelta| wins pink (0.327 -> c-top), then orange
    // (0.233 -> c-india), then blue (0.05 -> c-other).
    expect(campaignUserMsg).toContain("{color: pink}");
    expect(campaignUserMsg).toContain("campaign_id=c-top");

    // The rendered section assigns the matching highlight to the row.
    const channelCampaign = composed.report.sections.find(
      (s) => s.id === "channel_campaign",
    );
    if (channelCampaign && channelCampaign.id === "channel_campaign") {
      const topRow = channelCampaign.rows.find((r) =>
        r.campaignName.includes("WW-Top"),
      );
      expect(topRow?.highlight).toBe("pink");
    }

    // Bullet inherited the {{pink}} highlight from the markup.
    if (channelCampaign && channelCampaign.id === "channel_campaign") {
      const bullet0 = channelCampaign.prose?.[0].bullets[0];
      expect(bullet0?.highlights[0]).toEqual({
        kind: "pink",
        text: "WW-Top campaign",
      });
    }
  });
});
