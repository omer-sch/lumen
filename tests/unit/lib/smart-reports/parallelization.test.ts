// @vitest-environment node
// Files under test:
//   src/lib/smart-reports/concurrency-limit.ts
//   src/lib/smart-reports/templates/weekly-review-globalcomix.ts
//
// Two acceptance tests for WS1's parallel writer rollout:
//   1. Wall-time: with a 100ms delay per writer, the parallel
//      implementation completes the channel pairs in roughly one
//      slot instead of N. We don't measure absolute ms (CI is
//      noisy) but we assert "under N x 100ms" with margin.
//   2. Concurrency cap: with the shared Limit set to 2, never more
//      than 2 writers are in flight at the same time even when the
//      composition has many channels.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
import { createLimit } from "@/lib/smart-reports/concurrency-limit";
import { buildWeeklyReviewGlobalcomix } from "@/lib/smart-reports/templates/weekly-review-globalcomix";
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

function campaignRow(network: string) {
  return {
    campaign_id: `c-${network}-1`,
    campaign_name: `YH_${network}_APP`,
    network,
    spend: 800,
    installs: 80,
    cpi: 10,
    roi_d7: 0.3,
    spendDelta: 0.1,
    family: "Sub Evergreen",
    geo: "WW",
    campaignType: "Evergreen" as const,
    platform: "Android",
  };
}

function readyData(): ReadyData {
  const intent: Intent = {
    client: "globalcomix",
    platforms: ["android"],
    channels: ["meta", "google", "tiktok"],
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
    networks: [
      networkRow("Meta", 1000),
      networkRow("Google", 800),
      networkRow("TikTok", 500),
    ],
    campaigns: [
      campaignRow("Meta"),
      campaignRow("Google"),
      campaignRow("TikTok"),
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
      fetchedAt: "2026-05-16T12:00:00.000Z",
      bqCacheAgeSeconds: 100,
    },
  };
}

/** Build a writer response for whichever tool the call requested. */
function respondTo(input: { tools?: { name: string }[] }) {
  const toolName = input.tools?.[0]?.name ?? "write_unknown";
  const baseUsage = { input_tokens: 50, output_tokens: 20 };
  if (toolName === "write_platform_overall") {
    return {
      content: [
        {
          type: "tool_use",
          name: toolName,
          input: {
            blocks: [
              {
                heading: "Meta",
                bullets: [
                  { text: "Steady [cite:network-breakdown]" },
                  { text: "ROAS holding [cite:network-breakdown]" },
                ],
                bottomLine: "Hold pacing.",
              },
            ],
          },
        },
      ],
      usage: baseUsage,
    };
  }
  if (toolName === "write_weekly_breakdown") {
    return {
      content: [
        {
          type: "tool_use",
          name: toolName,
          input: {
            bullets: [
              { text: "OK [cite:network-breakdown]" },
              { text: "Stable [cite:network-breakdown]" },
            ],
            bottomLine: "Hold.",
          },
        },
      ],
      usage: baseUsage,
    };
  }
  if (toolName === "write_campaign_breakdown") {
    return {
      content: [
        {
          type: "tool_use",
          name: toolName,
          input: {
            blocks: [
              {
                heading: "Sub Evergreen",
                bullets: [
                  { text: "WW steady [cite:campaigns]" },
                  { text: "No movement [cite:campaigns]" },
                ],
                bottomLine: "Hold.",
              },
            ],
          },
        },
      ],
      usage: baseUsage,
    };
  }
  return { content: [], usage: baseUsage };
}

beforeEach(() => {
  messagesCreateMock.mockReset();
  delete process.env.ANTHROPIC_API_KEY;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("WS1: parallel writers", () => {
  it("completes channel writers in parallel (wall time below sequential floor)", async () => {
    // Each writer call takes 100ms. With 3 channels x (weekly +
    // campaign) + 1 platform_overall = 7 calls, the sequential
    // wall time would be ~700ms. Parallel execution should land
    // in 1-2 "slots" depending on the inter-stage await.
    messagesCreateMock.mockImplementation(async (input: unknown) => {
      await new Promise((r) => setTimeout(r, 100));
      return respondTo(input as { tools?: { name: string }[] });
    });

    const t0 = Date.now();
    const composed = await composeReport({
      readyData: readyData(),
      intent: readyData().intent,
      ownerUserId: "test-user",
      options: { template: "weekly-review-globalcomix" },
    });
    const elapsed = Date.now() - t0;

    // Sanity: the composition actually ran the writers.
    expect(composed.report.chapters?.[0]?.sections.length).toBeGreaterThan(0);
    expect(messagesCreateMock.mock.calls.length).toBeGreaterThanOrEqual(7);

    // Floor: well under the 700ms sequential time. Generous to
    // absorb CI noise -- if we ever regress to sequential, this
    // would land at ~700ms and the test would fail.
    expect(elapsed).toBeLessThan(400);
  });

  it("respects the concurrency cap (no more than N writers in flight at once)", async () => {
    let inFlight = 0;
    let peak = 0;
    messagesCreateMock.mockImplementation(async (input: unknown) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 30));
      inFlight -= 1;
      return respondTo(input as { tools?: { name: string }[] });
    });

    // Drive the template directly with a cap=2 Limit so we can prove
    // the ceiling without poking process.env.
    const ready = readyData();
    const limit = createLimit(2);
    const built = await buildWeeklyReviewGlobalcomix({
      ready,
      intent: ready.intent,
      options: { template: "weekly-review-globalcomix" },
      dataIsPlatformFiltered: false,
      // The orchestrator builds its own Limit today; this test exercises
      // the chapter directly to assert the cap. Replace the orchestrator
      // call once buildWeeklyReviewGlobalcomix accepts an outer limit
      // (post-WS2 may want that).
    } as never).catch(async () => null);

    // The above call goes through the production code (which builds
    // its own Limit from serverEnv). For a deterministic concurrency
    // assertion we re-exercise the chapter builder under the test's
    // explicit limit instead. Suppress the unused-binding warning.
    void built;

    inFlight = 0;
    peak = 0;
    const { buildChapter } = await import(
      "@/lib/smart-reports/templates/weekly-review-globalcomix"
    );
    const result = await buildChapter({
      ready,
      intent: ready.intent,
      platform: "android",
      options: { template: "weekly-review-globalcomix" },
      dataIsPlatformFiltered: false,
      limit,
    });
    expect(result).not.toBeNull();
    // 3 channels x 2 writers + 1 platform-overall = 7 calls. Cap=2
    // means at most 2 of those run together.
    expect(messagesCreateMock.mock.calls.length).toBeGreaterThanOrEqual(7);
    expect(peak).toBeLessThanOrEqual(2);
    expect(peak).toBeGreaterThanOrEqual(2); // exact cap saturates
  });
});
