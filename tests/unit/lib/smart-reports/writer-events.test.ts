// @vitest-environment node
// Layer 2 (lib unit). File under test:
//   src/lib/smart-reports/templates/weekly-review-globalcomix.ts
//
// WS7 contract: when an `emit` callback is supplied, the template
// fires writer_started / writer_finished events around each
// prose-writer Anthropic call and a section_ready event after each
// section is fully assembled. Sequence is deterministic given fixed
// LLM mocks.

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
import type { HermesEvent } from "@/lib/agents/hermes/events";
import type { Intent, ReadyData } from "@/lib/analyst/types";

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

function readyData(): ReadyData {
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
        campaign_id: "c1",
        campaign_name: "YH_FB_APP_FULL_IAP_Sub_Android_Evergreen_WW",
        network: "Meta",
        spend: 800,
        installs: 80,
        cpi: 10,
        roas: 0.3,
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
      cacheKey: "k",
      fetchedAt: "2026-05-17T12:00:00.000Z",
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

describe("WS7: per-writer events", () => {
  it("fires writer_started / writer_finished / section_ready around each writer", async () => {
    messagesCreateMock
      .mockResolvedValueOnce(
        toolResp("write_platform_overall", {
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
        }),
      )
      .mockResolvedValueOnce(
        toolResp("write_weekly_breakdown", {
          bullets: [
            { text: "Steady [cite:network-breakdown]" },
            { text: "Holding [cite:network-breakdown]" },
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
                { text: "WW steady [cite:campaigns]" },
                { text: "Other geos held [cite:campaigns]" },
              ],
              bottomLine: "No changes.",
            },
          ],
        }),
      );

    const events: HermesEvent[] = [];
    const ready = readyData();
    await composeReport({
      readyData: ready,
      intent: ready.intent,
      ownerUserId: "test-user",
      options: { template: "weekly-review-globalcomix" },
      emit: (ev) => events.push(ev),
    });

    const writerStarted = events.filter((e) => e.type === "writer_started");
    const writerFinished = events.filter((e) => e.type === "writer_finished");
    const sectionReady = events.filter((e) => e.type === "section_ready");

    // 3 writers (overall + weekly + campaign) -> 3 starts + 3 finishes
    expect(writerStarted).toHaveLength(3);
    expect(writerFinished).toHaveLength(3);
    // 3 sections assembled -> 3 section_ready events
    expect(sectionReady).toHaveLength(3);

    // Section ids match the renderer / regenerate-route scheme.
    const ids = new Set(
      sectionReady
        .filter((e) => e.type === "section_ready")
        .map((e) =>
          e.type === "section_ready" ? e.sectionId : "",
        ),
    );
    expect(ids).toEqual(
      new Set([
        "android--platform_overall",
        "android-meta--channel_weekly",
        "android-meta--channel_campaign",
      ]),
    );

    // Per-writer events carry platform + channel context that the UI
    // uses for the status-tape label.
    const startedPlatformOverall = writerStarted.find(
      (e) =>
        e.type === "writer_started" && e.sectionType === "platform_overall",
    );
    expect(startedPlatformOverall).toBeDefined();
    if (startedPlatformOverall?.type === "writer_started") {
      expect(startedPlatformOverall.platform).toBe("android");
      expect(startedPlatformOverall.channel).toBeNull();
    }

    const startedChannelWeekly = writerStarted.find(
      (e) =>
        e.type === "writer_started" && e.sectionType === "channel_weekly",
    );
    if (startedChannelWeekly?.type === "writer_started") {
      expect(startedChannelWeekly.platform).toBe("android");
      expect(startedChannelWeekly.channel).toBe("meta");
    }
  });

  it("is a no-op when no emitter is supplied (existing path stays byte-identical)", async () => {
    messagesCreateMock
      .mockResolvedValueOnce(
        toolResp("write_platform_overall", {
          blocks: [
            {
              heading: "Facebook",
              bullets: [
                { text: "Stable [cite:network-breakdown]" },
                { text: "ROAS holding [cite:network-breakdown]" },
              ],
              bottomLine: "Hold.",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        toolResp("write_weekly_breakdown", {
          bullets: [
            { text: "OK [cite:network-breakdown]" },
            { text: "Steady [cite:network-breakdown]" },
          ],
          bottomLine: "Hold.",
        }),
      )
      .mockResolvedValueOnce(
        toolResp("write_campaign_breakdown", {
          blocks: [
            {
              heading: "Sub Evergreen",
              bullets: [
                { text: "Steady [cite:campaigns]" },
                { text: "Steady [cite:campaigns]" },
              ],
              bottomLine: "Hold.",
            },
          ],
        }),
      );

    const ready = readyData();
    const composed = await composeReport({
      readyData: ready,
      intent: ready.intent,
      ownerUserId: "test-user",
      options: { template: "weekly-review-globalcomix" },
    });
    expect(composed.report.chapters?.[0]?.sections.length).toBe(3);
  });
});
