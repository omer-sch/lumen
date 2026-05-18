// @vitest-environment node
// Layer 2 (lib unit). Files under test:
//   src/lib/smart-reports/index.ts (composeReport dispatch)
//   src/lib/smart-reports/templates/weekly-review-globalcomix.ts
//
// composeReport with template="weekly-review-globalcomix" orchestrates
// platform-overall + per-channel weekly + per-channel campaign writers,
// stamps chapters + closer, and surfaces a cover caveat when the BQ
// layer is still client-wide. With the Sonnet calls mocked we verify:
//   - The right number of writer calls fire for the active channels.
//   - The chapter shape carries platform + divider + sections.
//   - Citations are validated against ReadyData.provenance.
//   - Scope caveat is surfaced on the Report.filterRange when the
//     snapshot data is client-wide (today's reality).
//   - Closer slide is emitted (with the default fallback when
//     ANTHROPIC_API_KEY is unset).

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

function fakeReadyData(over: Partial<ReadyData> = {}): ReadyData {
  return {
    intent: {
      client: "globalcomix",
      platforms: ["android"],
      channels: ["meta", "google"],
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
      networkRow("Meta", 1000),
      networkRow("Google", 800),
    ],
    campaigns: [
      {
        campaign_id: "c1",
        campaign_name: "YH_FB_APP_FULL_IAP_Sub_Android_Evergreen_WW",
        network: "Meta",
        spend: 800,
        installs: 80,
        cpi: 10,
        roi_d7: 0.3,
        spendDelta: 0.1,
        family: "Sub Evergreen",
        geo: "WW",
        campaignType: "Evergreen",
        platform: "Android",
      },
    ],
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
      cacheKey: "lumen:cache:v1:globalcomix:analyst-ready-data:abcd",
      fetchedAt: "2026-05-16T12:00:00.000Z",
      bqCacheAgeSeconds: 100,
    },
    ...over,
  };
}

function networkRow(name: string, spend: number) {
  return {
    network: name,
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

const intent: Intent = {
  client: "globalcomix",
  platforms: ["android"],
  channels: ["meta", "google"],
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
  delete process.env.ANTHROPIC_API_KEY;
});

describe("composeReport (weekly-review-globalcomix template)", () => {
  it("emits one chapter for intent.platforms[0] under client-wide data with a scope caveat on the cover", async () => {
    // Sonnet call accounting under this fixture:
    //   - writePlatformOverall (1)
    //   - meta weekly (2)
    //   - meta campaign (3)              <- only Meta has campaigns in the fixture
    //   - google weekly (4)
    //   - google campaign: short-circuits without a Sonnet call because
    //     the Google network has zero campaign rows (groupCampaignsByFamily
    //     returns []). Provide the 5th mock anyway as a defensive
    //     no-op so the test stays robust to ordering shifts.
    messagesCreateMock
      .mockResolvedValueOnce(toolResp("write_platform_overall", {
        blocks: [
          {
            heading: "Facebook",
            bullets: [
              { text: "{{bad}}Decline across the funnel{{/bad}} [cite:network-breakdown]" },
              { text: "CPA D7 still maturing [cite:network-breakdown]" },
            ],
            bottomLine: "Pause pending creative refresh.",
          },
        ],
      }))
      .mockResolvedValueOnce(toolResp("write_weekly_breakdown", {
        bullets: [
          { text: "Meta declined; {{bad}}CPA up 20%{{/bad}} [cite:network-breakdown]" },
          { text: "Top-Geos drove the increase [cite:network-breakdown]" },
        ],
        bottomLine: "Meta is the bottleneck this week.",
      }))
      .mockResolvedValueOnce(toolResp("write_campaign_breakdown", {
        blocks: [
          {
            heading: "Sub Evergreen",
            bullets: [
              { text: "WW continues to deliver [cite:campaigns]" },
              { text: "Other geos held steady [cite:campaigns]" },
            ],
            bottomLine: "Keep WW; revisit India next week.",
          },
        ],
      }))
      .mockResolvedValueOnce(toolResp("write_weekly_breakdown", {
        bullets: [
          { text: "Google stable [cite:network-breakdown]" },
          { text: "ROAS holding [cite:network-breakdown]" },
        ],
        bottomLine: "Maintain Google budgets.",
      }))
      .mockResolvedValueOnce(toolResp("write_campaign_breakdown", {
        blocks: [],
      }));

    const composed = await composeReport({
      readyData: fakeReadyData(),
      intent,
      ownerUserId: "test-user",
      options: { template: "weekly-review-globalcomix" },
    });

    // Chapters: exactly one (Android) under the client-wide degraded path.
    expect(composed.report.chapters).toBeDefined();
    expect(composed.report.chapters).toHaveLength(1);
    const chapter = composed.report.chapters![0];
    expect(chapter.platform).toBe("android");
    expect(chapter.divider.title).toBe("Android");
    // Sections inside: platform_overall + 2x channel_weekly + 1x channel_campaign
    // (Meta campaign emitted; Google campaign skipped because the
    // writer returned blocks=[]).
    const ids = chapter.sections.map((s) => s.id);
    expect(ids).toEqual([
      "platform_overall",
      "channel_weekly",
      "channel_campaign",
      "channel_weekly",
    ]);

    // Cover caveat surfaced via filterRange.
    expect(composed.report.filterRange).toMatch(/client-wide across platforms/);

    // Closer present even without ANTHROPIC_API_KEY (default fallback).
    expect(composed.report.closer?.title).toBe("Thank you");

    // Diagnostics: chapter count, prose blocks, validated citations.
    expect(composed.diagnostics.proseBlocks).toBeGreaterThan(0);
    expect(composed.diagnostics.citationsValidated).toBeGreaterThan(0);

    // Sonnet was called 4 times: platform-overall + 2 weeklies +
    // 1 campaign (Google campaign short-circuited; see comment above).
    expect(messagesCreateMock).toHaveBeenCalledTimes(4);
  });

  it("throws when a citation references an unknown queryId", async () => {
    messagesCreateMock
      .mockResolvedValueOnce(toolResp("write_platform_overall", {
        blocks: [
          {
            heading: "Facebook",
            bullets: [
              { text: "Bad citation [cite:fictional-query]" },
              { text: "Second bullet [cite:network-breakdown]" },
            ],
            bottomLine: "Investigate.",
          },
        ],
      }))
      .mockResolvedValueOnce(
        toolResp("write_weekly_breakdown", { bullets: [], bottomLine: "" }),
      )
      .mockResolvedValueOnce(toolResp("write_campaign_breakdown", { blocks: [] }))
      .mockResolvedValueOnce(
        toolResp("write_weekly_breakdown", { bullets: [], bottomLine: "" }),
      )
      .mockResolvedValueOnce(toolResp("write_campaign_breakdown", { blocks: [] }));

    await expect(
      composeReport({
        readyData: fakeReadyData(),
        intent,
        ownerUserId: "test-user",
        options: { template: "weekly-review-globalcomix" },
      }),
    ).rejects.toThrow(/fictional-query/);
  });

  it("honors intent.channels: an iOS / Meta-only intent does not emit Google or TikTok sections", async () => {
    // Sonnet call accounting:
    //   - writePlatformOverall (1)
    //   - meta weekly (2)
    //   - meta campaign: short-circuits because the fixture's only
    //     campaign is on Meta with platform=Android; the campaign
    //     writer's family group still has one row, so it fires.
    //     We mock it defensively.
    messagesCreateMock
      .mockResolvedValueOnce(toolResp("write_platform_overall", {
        blocks: [
          {
            heading: "Facebook",
            bullets: [
              { text: "{{bad}}Decline across the funnel{{/bad}} [cite:network-breakdown]" },
              { text: "CPA D7 still maturing [cite:network-breakdown]" },
            ],
            bottomLine: "Pause pending creative refresh.",
          },
        ],
      }))
      .mockResolvedValueOnce(toolResp("write_weekly_breakdown", {
        bullets: [
          { text: "Meta declined; {{bad}}CPA up 20%{{/bad}} [cite:network-breakdown]" },
          { text: "Top-Geos drove the increase [cite:network-breakdown]" },
        ],
        bottomLine: "Meta is the bottleneck this week.",
      }))
      .mockResolvedValueOnce(toolResp("write_campaign_breakdown", {
        blocks: [
          {
            heading: "Sub Evergreen",
            bullets: [
              { text: "WW continues to deliver [cite:campaigns]" },
              { text: "Other geos held steady [cite:campaigns]" },
            ],
            bottomLine: "Keep WW; revisit India next week.",
          },
        ],
      }));

    const iosMetaIntent: Intent = {
      ...intent,
      platforms: ["ios"],
      channels: ["meta"],
    };
    const composed = await composeReport({
      readyData: fakeReadyData({ intent: iosMetaIntent }),
      intent: iosMetaIntent,
      ownerUserId: "test-user",
      options: { template: "weekly-review-globalcomix" },
    });

    expect(composed.report.chapters).toHaveLength(1);
    const chapter = composed.report.chapters![0];
    // Degraded mode: emit the first requested platform (iOS).
    expect(chapter.platform).toBe("ios");
    // WS4 platform filter: the fixture's only campaign has
    // platform=Android, so the iOS chapter's channel_campaign section
    // short-circuits (no campaigns match). platform_overall +
    // channel_weekly still emit because they read network-grain
    // data, not campaign-grain.
    const ids = chapter.sections.map((s) => s.id);
    expect(ids).toEqual(["platform_overall", "channel_weekly"]);
    // No Google / TikTok / ASA sections leaked.
    const channelSections = chapter.sections.filter(
      (s) => s.id === "channel_weekly" || s.id === "channel_campaign",
    );
    for (const s of channelSections) {
      if (s.id === "channel_weekly" || s.id === "channel_campaign") {
        expect(s.channel).toBe("meta");
      }
    }
    // Sonnet fires 2 times (overall + weekly). The campaign writer
    // short-circuits before Sonnet because no campaigns match the
    // chapter's platform.
    expect(messagesCreateMock).toHaveBeenCalledTimes(2);
  });

  it("WS4: filters campaigns by platform via the classifier", async () => {
    // Two campaigns on Meta -- one Android, one iOS. Compose with
    // intent.platforms=["android"], intent.channels=["meta"]. The
    // iOS campaign must be dropped from the Android chapter.
    const ready = fakeReadyData();
    ready.campaigns = [
      {
        campaign_id: "c-android",
        campaign_name: "YH_FB_APP_FULL_IAP_Sub_Android_Evergreen_WW",
        network: "Meta",
        spend: 800,
        installs: 80,
        cpi: 10,
        roi_d7: 0.3,
        spendDelta: 0.1,
        family: "Sub Evergreen",
        geo: "WW",
        campaignType: "Evergreen",
        platform: "Android",
      },
      {
        campaign_id: "c-ios",
        campaign_name: "YH_FB_APP_FULL_IAP_Sub_iOS_Evergreen_WW",
        network: "Meta",
        spend: 500,
        installs: 40,
        cpi: 12.5,
        roi_d7: 0.25,
        spendDelta: 0.2,
        family: "Sub Evergreen",
        geo: "WW",
        campaignType: "Evergreen",
        platform: "iOS",
      },
    ];

    messagesCreateMock
      .mockResolvedValueOnce(toolResp("write_platform_overall", {
        blocks: [
          {
            heading: "Facebook",
            bullets: [
              { text: "Meta steady [cite:network-breakdown]" },
              { text: "ROAS holding [cite:network-breakdown]" },
            ],
            bottomLine: "Hold.",
          },
        ],
      }))
      .mockResolvedValueOnce(toolResp("write_weekly_breakdown", {
        bullets: [
          { text: "Steady week [cite:network-breakdown]" },
          { text: "Solid pacing [cite:network-breakdown]" },
        ],
        bottomLine: "Maintain.",
      }))
      .mockResolvedValueOnce(toolResp("write_campaign_breakdown", {
        blocks: [
          {
            heading: "Sub Evergreen",
            bullets: [
              { text: "WW steady [cite:campaigns]" },
              { text: "Other geos held [cite:campaigns]" },
            ],
            bottomLine: "No changes needed.",
          },
        ],
      }));

    const androidIntent: Intent = {
      ...intent,
      platforms: ["android"],
      channels: ["meta"],
    };
    const composed = await composeReport({
      readyData: ready,
      intent: androidIntent,
      ownerUserId: "test-user",
      options: { template: "weekly-review-globalcomix" },
    });

    const chapter = composed.report.chapters![0];
    const campaign = chapter.sections.find(
      (s) => s.id === "channel_campaign",
    );
    expect(campaign).toBeDefined();
    if (campaign && campaign.id === "channel_campaign") {
      // Only the Android campaign survives the WS4 filter.
      expect(campaign.rows).toHaveLength(1);
      expect(campaign.rows[0].campaignName).toMatch(/_Android_/);
      expect(campaign.rows[0].campaignName).not.toMatch(/_iOS_/);
    }

    // The campaign-breakdown user message carries the "Platform
    // scope: Android..." header so the writer doesn't refer to iOS
    // campaigns.
    const campaignCall = messagesCreateMock.mock.calls.find((args) => {
      const tools = (args[0] as { tools?: { name: string }[] }).tools ?? [];
      return tools.some((t) => t.name === "write_campaign_breakdown");
    });
    const userMsg = (campaignCall![0] as {
      messages: { role: string; content: string }[];
    }).messages[0].content;
    expect(userMsg).toMatch(/Platform scope: Android/);
  });

  it("returns null chapters when no requested channel runs on the platform (e.g. ASA on Android)", async () => {
    const intentAsaOnAndroid: Intent = {
      ...intent,
      platforms: ["android"],
      channels: ["apple_search_ads"],
    };
    const composed = await composeReport({
      readyData: fakeReadyData({ intent: intentAsaOnAndroid }),
      intent: intentAsaOnAndroid,
      ownerUserId: "test-user",
      options: { template: "weekly-review-globalcomix" },
    });

    // PLATFORM_CHANNELS.android excludes ASA -> chapter is skipped.
    expect(composed.report.chapters).toEqual([]);
    expect(messagesCreateMock).not.toHaveBeenCalled();
  });

  it("emits no chapters when ReadyData has no networks with spend", async () => {
    // Platform-overall writer short-circuits when the platform's
    // network list is empty; no Sonnet calls fire.
    const composed = await composeReport({
      readyData: fakeReadyData({ networks: [] }),
      intent,
      ownerUserId: "test-user",
      options: { template: "weekly-review-globalcomix" },
    });

    expect(composed.report.chapters).toEqual([]);
    expect(messagesCreateMock).not.toHaveBeenCalled();
  });
});

function toolResp(name: string, input: unknown) {
  return {
    content: [{ type: "tool_use", name, input }],
    usage: { input_tokens: 100, output_tokens: 40 },
  };
}
