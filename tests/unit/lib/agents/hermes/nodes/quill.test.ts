// @vitest-environment node
// Layer 2 (lib unit). File under test:
// src/lib/agents/hermes/nodes/quill.ts. Exercises the orchestration
// (tone retrieve, Sonnet, validator, memory write) plus the validator
// in isolation. The validator is load-bearing for the demo's trust
// contract.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { type Bullet, type Finding } from "@/lib/agents/hermes/state";

const retrieveMock = vi.hoisted(() => vi.fn());
const rememberMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rag/retrieve", () => ({
  retrieve: retrieveMock,
}));

vi.mock("@/lib/agents/_scaffold/memory", () => ({
  rememberSlice: rememberMock,
}));

class FakeAnthropic {
  messages = { create: vi.fn() };
}

const fake = new FakeAnthropic();

beforeEach(async () => {
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  retrieveMock.mockReset();
  rememberMock.mockReset();
  fake.messages.create.mockReset();
  retrieveMock.mockResolvedValue({
    chunks: [],
    citations: [],
    chunks_returned: 0,
    latency_ms: 0,
    query_embedding_cost_usd: 0,
  });
  rememberMock.mockResolvedValue(undefined);
  const mod = await import("@/lib/agents/_scaffold/model");
  mod.__setAnthropicClientForTesting(fake as never);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  const mod = await import("@/lib/agents/_scaffold/model");
  mod.__setAnthropicClientForTesting(null);
});

function baseFinding(over: Partial<Finding> = {}): Finding {
  return {
    kind: "anomaly",
    claim_template: "Meta CPA D7 jumped.",
    delta: 0.18,
    source_query_id: "network_breakdown",
    citations: [{ source_path: "vault/playbook.md", chunk_id: "abc-0" }],
    severity: "high",
    ...over,
  };
}

function baseBullet(over: Partial<Bullet> = {}): Bullet {
  return {
    claim: "Meta CPA D7 rose 18% to $4.20.",
    columns_used: ["cpa_d7"],
    source_query_id: "network_breakdown",
    delta_value: 0.18,
    action_item: null,
    citations: [{ source_path: "vault/playbook.md", chunk_id: "abc-0" }],
    slide_target: "channel_weekly",
    ...over,
  };
}

function baseState() {
  return {
    email_text: "x",
    run_id: "run-quill-1",
    intent: {
      client: "globalcomix",
      platforms: ["android"] as ("android" | "ios" | "web")[],
      channels: ["meta"] as ("meta" | "google" | "tiktok" | "apple_search_ads" | "applovin")[],
      period: { label: "last week", iso_start: null, iso_end: null },
      focus: null,
      confidence: 0.9,
      doubts: [],
    },
    context: { knowledge: [], history: [], comms: [] },
    findings: [baseFinding()] as Finding[],
    bullets: [] as Bullet[],
    deck: { pptx_path: null as string | null, slides: [] as Array<{ index: number; layout: string; title: string }> },
    approval: { approved: false, approved_by: null, approved_at: null, edits: [] as Array<{ bullet_index: number; original: string; revised: string }> },
    history: [] as Array<{ node: string; started_at: string; ended_at: string; notes?: string }>,
  };
}

function mockSonnetBullets(bullets: unknown[]) {
  fake.messages.create.mockResolvedValueOnce({
    content: [
      {
        type: "tool_use",
        name: "draft_bullets",
        id: "toolu_test",
        input: { bullets },
      },
    ],
  });
}

describe("validateBullets", () => {
  it("accepts a bullet whose source_query_id matches a Finding", async () => {
    const { validateBullets } = await import(
      "@/lib/agents/hermes/nodes/quill"
    );
    const verdict = validateBullets([baseBullet()], [baseFinding()]);
    expect(verdict.ok).toBe(true);
  });

  it("rejects a bullet whose source_query_id does not match any Finding", async () => {
    const { validateBullets } = await import(
      "@/lib/agents/hermes/nodes/quill"
    );
    const verdict = validateBullets(
      [baseBullet({ source_query_id: "fabricated_query" })],
      [baseFinding()],
    );
    expect(verdict.ok).toBe(false);
  });

  it("rejects a bullet that drops the Finding's citations on a framed claim", async () => {
    const { validateBullets } = await import(
      "@/lib/agents/hermes/nodes/quill"
    );
    const verdict = validateBullets(
      [
        baseBullet({
          citations: [],
          action_item: "Pause Meta android campaigns",
        }),
      ],
      [baseFinding()], // had citations
    );
    expect(verdict.ok).toBe(false);
  });

  it("allows a bullet with empty citations when the source Finding also had none", async () => {
    const { validateBullets } = await import(
      "@/lib/agents/hermes/nodes/quill"
    );
    const verdict = validateBullets(
      [baseBullet({ citations: [] })],
      [baseFinding({ citations: [] })],
    );
    expect(verdict.ok).toBe(true);
  });
});

describe("quill node", () => {
  it("happy path: retrieves tone, calls Sonnet, validates, writes memory", async () => {
    mockSonnetBullets([baseBullet()]);
    const { quill } = await import("@/lib/agents/hermes/nodes/quill");
    const update = await quill(baseState());
    expect(update.bullets).toHaveLength(1);
    expect(update.bullets?.[0].claim).toMatch(/Meta CPA D7/);
    expect(retrieveMock).toHaveBeenCalledWith(
      expect.objectContaining({ corpus: "history" }),
    );
    expect(rememberMock).toHaveBeenCalledWith(
      "quill",
      "globalcomix",
      expect.objectContaining({ bullets: expect.any(Array) }),
    );
  });

  it("skips when there are no findings", async () => {
    const state = baseState();
    state.findings = [];
    const { quill } = await import("@/lib/agents/hermes/nodes/quill");
    const update = await quill(state);
    expect(update.bullets).toEqual([]);
    expect(fake.messages.create).not.toHaveBeenCalled();
  });

  it("throws the run when the validator rejects a bullet", async () => {
    mockSonnetBullets([
      baseBullet({ source_query_id: "fabricated_query" }),
    ]);
    const { quill } = await import("@/lib/agents/hermes/nodes/quill");
    await expect(quill(baseState())).rejects.toThrow(
      /validator failed/,
    );
  });

  it("survives a tone retrieve failure (degrades to empty references)", async () => {
    retrieveMock.mockRejectedValueOnce(new Error("RAG offline"));
    mockSonnetBullets([baseBullet()]);
    const { quill } = await import("@/lib/agents/hermes/nodes/quill");
    const update = await quill(baseState());
    expect(update.bullets).toHaveLength(1);
  });

  it("rememberSlice failure does not break the run", async () => {
    rememberMock.mockRejectedValueOnce(new Error("supabase down"));
    mockSonnetBullets([baseBullet()]);
    const { quill } = await import("@/lib/agents/hermes/nodes/quill");
    const update = await quill(baseState());
    expect(update.bullets).toHaveLength(1);
  });

  it("rejects an unknown slide_target via Zod (schema-enforced enum)", async () => {
    mockSonnetBullets([
      {
        ...baseBullet(),
        slide_target: "not_a_real_slide",
      },
    ]);
    const { quill } = await import("@/lib/agents/hermes/nodes/quill");
    await expect(quill(baseState())).rejects.toThrow();
  });
});
