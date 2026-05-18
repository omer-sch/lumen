// @vitest-environment node
// Layer 2 (lib unit). File under test: src/lib/smart-reports/index.ts.
//
// composeReport happy path with the Sonnet call mocked. Verifies the
// orchestration: prose-writer is called twice (weekly + campaign),
// highlight markup is parsed, citations are validated against
// ReadyData.provenance, and the Report shape matches what the
// renderer expects.

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

function fakeReadyData(): ReadyData {
  return {
    intent: {
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
    },
    clientLabel: "GlobalComix",
    period: {
      label: "last 7 days",
      isoStart: "2026-05-01",
      isoEnd: "2026-05-07",
    },
    networks: [
      {
        network: "Meta",
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
      },
    ],
    campaigns: [
      {
        campaign_id: "c1",
        campaign_name: "YH_FB_APP_FULL_IAP_Sub_iOS_Evergreen_WW",
        network: "Meta",
        spend: 800,
        installs: 80,
        cpi: 10,
        roi_d7: 0.3,
        spendDelta: 0.1,
        family: "Sub Evergreen",
        geo: "WW",
        campaignType: "Evergreen",
        platform: "iOS",
      },
    ],
    trend: [],
    history: {
      networks: [
        {
          network: "Meta",
          weekIsoStart: "2026-04-20",
          weekIsoEnd: "2026-04-26",
          weekNumber: 17,
          weekLabel: "Apr 20 to Apr 26 (Week 17)",
          metrics: {
            network: "Meta",
            spend: 900,
            share: 0.5,
            installs: 95,
            clicks: 4800,
            impressions: 96000,
            cpi: 9.5,
            ctr: 0.05,
            cpm: 9.4,
            cpc: 0.19,
            roasD7: 0.32,
            roasD14: 0.37,
            roasD30: 0.42,
            roasD90: 0.46,
            ftdD7: 28,
            payersD7: 24,
            retD7: 0.41,
            subStart: 48,
            subD0: 29,
            subD7: 24,
            cpSubStart: 18.75,
            cpaD0: 31.03,
            cpaD7: 37.5,
            trailingCpaD7Avg: 35,
          },
        },
      ],
    },
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
      cacheKey: "lumen:cache:v1:globalcomix:analyst-ready-data:abcd",
      fetchedAt: "2026-05-16T12:00:00.000Z",
      bqCacheAgeSeconds: 100,
    },
  };
}

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

beforeEach(() => {
  messagesCreateMock.mockReset();
});

describe("composeReport (single-channel-weekly)", () => {
  it("orchestrates weekly + campaign writers, validates citations, and assembles a Report with bullets + bottomLine", async () => {
    messagesCreateMock
      .mockResolvedValueOnce({
        content: [
          {
            type: "tool_use",
            name: "write_weekly_breakdown",
            input: {
              bullets: [
                {
                  text:
                    "Meta declined this week; {{bad}}lower-funnel costs increased over 20%{{/bad}} vs Week 17 [cite:network-breakdown]",
                },
                {
                  text:
                    "Sub D7 still maturing; rely on D0 trends [cite:network-breakdown]",
                },
              ],
              bottomLine: "Pause Top-Geos until creative refresh ships.",
            },
          },
        ],
        usage: { input_tokens: 100, output_tokens: 40 },
      })
      .mockResolvedValueOnce({
        content: [
          {
            type: "tool_use",
            name: "write_campaign_breakdown",
            input: {
              blocks: [
                {
                  heading: "Sub Evergreen",
                  bullets: [
                    {
                      text:
                        "The WW campaign delivered {{good}}strong results{{/good}} this week [cite:campaigns]",
                    },
                    {
                      text: "Other geos held steady [cite:campaigns]",
                    },
                  ],
                  bottomLine: "Keep WW budget; revisit India next week.",
                },
              ],
            },
          },
        ],
        usage: { input_tokens: 80, output_tokens: 30 },
      });

    const composed = await composeReport({
      readyData: fakeReadyData(),
      intent,
      ownerUserId: "test-user",
      options: { template: "single-channel-weekly" },
    });

    expect(messagesCreateMock).toHaveBeenCalledTimes(2);

    expect(composed.report.client).toBe("globalcomix");
    expect(composed.report.sections.length).toBeGreaterThan(0);
    // No runId -> manual builder path -> Nova credits the cover.
    expect(composed.report.authoredBy).toBe("nova");

    const weekly = composed.report.sections.find(
      (s) => s.id === "channel_weekly",
    );
    expect(weekly).toBeDefined();
    if (weekly && weekly.id === "channel_weekly") {
      expect(weekly.prose).toBeDefined();
      expect(weekly.prose).toHaveLength(1);
      const block = weekly.prose![0];
      expect(block.bullets).toHaveLength(2);
      // First bullet has the bad highlight + placeholder.
      expect(block.bullets[0].highlights).toEqual([
        { kind: "bad", text: "lower-funnel costs increased over 20%" },
      ]);
      expect(block.bullets[0].text).toContain("[[highlight:0]]");
      expect(block.bullets[0].text).not.toContain("[cite:");
      // Bottom line is plain copy.
      expect(block.bottomLine).toBe(
        "Pause Top-Geos until creative refresh ships.",
      );
    }

    const campaign = composed.report.sections.find(
      (s) => s.id === "channel_campaign",
    );
    if (campaign && campaign.id === "channel_campaign") {
      expect(campaign.prose).toHaveLength(1);
      const block = campaign.prose![0];
      expect(block.heading).toBe("Sub Evergreen");
      expect(block.bullets[0].highlights).toEqual([
        { kind: "good", text: "strong results" },
      ]);
      expect(block.bottomLine).toMatch(/Keep WW budget/);
    }

    expect(composed.diagnostics.proseBlocks).toBe(2);
    expect(composed.diagnostics.citationsValidated).toBeGreaterThan(0);
  });

  it("stamps authoredBy=hermes when invoked with a runId", async () => {
    messagesCreateMock
      .mockResolvedValueOnce({
        content: [
          {
            type: "tool_use",
            name: "write_weekly_breakdown",
            input: {
              bullets: [
                { text: "Meta declined [cite:network-breakdown]" },
                { text: "Top-Geos drove it [cite:network-breakdown]" },
              ],
              bottomLine: "Pause Top-Geos.",
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        content: [
          {
            type: "tool_use",
            name: "write_campaign_breakdown",
            input: { blocks: [] },
          },
        ],
      });

    const composed = await composeReport({
      readyData: fakeReadyData(),
      intent,
      ownerUserId: "test-user",
      options: { template: "single-channel-weekly" },
      runId: "run-xyz",
    });
    expect(composed.report.authoredBy).toBe("hermes");
    expect(composed.report.source).toBe("hermes");
  });

  it("throws when the writer cites a queryId the analyst did not fetch", async () => {
    messagesCreateMock
      .mockResolvedValueOnce({
        content: [
          {
            type: "tool_use",
            name: "write_weekly_breakdown",
            input: {
              bullets: [
                { text: "Meta declined [cite:made-up-query]" },
                { text: "Other context [cite:made-up-query]" },
              ],
              bottomLine: "Investigate.",
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        content: [
          {
            type: "tool_use",
            name: "write_campaign_breakdown",
            input: { blocks: [] },
          },
        ],
      });

    await expect(
      composeReport({
        readyData: fakeReadyData(),
        intent,
        ownerUserId: "test-user",
        options: { template: "single-channel-weekly" },
      }),
    ).rejects.toThrow(/made-up-query/);
  });

  it("emits no weekly prose when the channel has no current-period network spend", async () => {
    const ready = fakeReadyData();
    ready.networks = [];

    messagesCreateMock.mockResolvedValueOnce({
      content: [
        {
          type: "tool_use",
          name: "write_campaign_breakdown",
          input: { blocks: [] },
        },
      ],
    });

    const composed = await composeReport({
      readyData: ready,
      intent,
      ownerUserId: "test-user",
      options: { template: "single-channel-weekly" },
    });

    expect(messagesCreateMock).toHaveBeenCalledTimes(1);

    const weekly = composed.report.sections.find(
      (s) => s.id === "channel_weekly",
    );
    expect(weekly).toBeUndefined();

    const campaign = composed.report.sections.find(
      (s) => s.id === "channel_campaign",
    );
    expect(campaign).toBeDefined();
    if (campaign && campaign.id === "channel_campaign") {
      expect(campaign.prose).toEqual([]);
    }
  });
});
