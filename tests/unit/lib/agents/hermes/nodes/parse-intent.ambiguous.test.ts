// @vitest-environment node
// Layer 2 (lib unit). Behavioral tests for ambiguous inputs — relative
// periods with null iso dates, multiple focuses dumped to doubts, low
// confidence with populated doubts, retrieve fallback to empty. Mocks
// Haiku per case; the prompt + tool schema do the real work in
// production but here we verify the node correctly accepts and threads
// what Haiku reasonably returns.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const retrieveMock = vi.hoisted(() => vi.fn());
const rememberSliceMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rag/retrieve", () => ({
  retrieve: retrieveMock,
}));

vi.mock("@/lib/agents/_scaffold/memory", () => ({
  rememberSlice: rememberSliceMock,
}));

class FakeAnthropic {
  messages = {
    create: vi.fn(),
  };
}

const fake = new FakeAnthropic();

beforeEach(async () => {
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  fake.messages.create.mockReset();
  retrieveMock.mockReset();
  rememberSliceMock.mockReset();
  retrieveMock.mockResolvedValue({
    chunks: [],
    citations: [],
    chunks_returned: 0,
    latency_ms: 0,
    query_embedding_cost_usd: 0,
  });
  rememberSliceMock.mockResolvedValue(undefined);
  const mod = await import("@/lib/agents/_scaffold/model");
  mod.__setAnthropicClientForTesting(fake as never);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  const mod = await import("@/lib/agents/_scaffold/model");
  mod.__setAnthropicClientForTesting(null);
});

function makeState(email_text: string) {
  return {
    email_text,
    run_id: "amb-run-1",
    intent: null,
    context: { knowledge: [], history: [], comms: [] },
    findings: [],
    bullets: [],
    deck: { pptx_path: null, slides: [] },
    approval: {
      approved: false,
      approved_by: null,
      approved_at: null,
      edits: [],
    },
    history: [],
  };
}

function mockHaikuIntent(input: unknown) {
  fake.messages.create.mockResolvedValueOnce({
    content: [
      {
        type: "tool_use",
        name: "extract_intent",
        id: "toolu_test",
        input,
      },
    ],
  });
}

describe("parseIntent — ambiguous-input behavior", () => {
  it("accepts null iso_start / iso_end for relative periods", async () => {
    mockHaikuIntent({
      client: "globalcomix",
      platforms: ["android"],
      channels: ["meta"],
      period: { label: "last week", iso_start: null, iso_end: null },
      focus: null,
      confidence: 0.78,
      doubts: ["No platform specified explicitly; defaulted to android."],
    });
    const { parseIntent } = await import(
      "@/lib/agents/hermes/nodes/parse-intent"
    );
    const update = await parseIntent(
      makeState("Send me the GlobalComix numbers for last week."),
    );
    expect(update.intent?.period.iso_start).toBeNull();
    expect(update.intent?.period.iso_end).toBeNull();
    expect(update.intent?.period.label).toBe("last week");
  });

  it("accepts multiple-focus emails with primary focus + extras dumped to doubts", async () => {
    mockHaikuIntent({
      client: "globalcomix",
      platforms: ["android", "ios"],
      channels: ["meta", "google"],
      period: { label: "this past week", iso_start: null, iso_end: null },
      focus: "iOS Meta CPI movement",
      confidence: 0.74,
      doubts: [
        "Email also asks about Google android creatives — folded into report scope.",
        "Email mentions a Q4 budget review — flagged as a separate ask.",
      ],
    });
    const { parseIntent } = await import(
      "@/lib/agents/hermes/nodes/parse-intent"
    );
    const update = await parseIntent(
      makeState(
        "Weekly review please for GlobalComix. iOS Meta CPI is moving. Also can you cover Google android creatives? And a separate Q4 budget review.",
      ),
    );
    expect(update.intent?.focus).toBe("iOS Meta CPI movement");
    expect(update.intent?.doubts).toHaveLength(2);
    expect(update.intent?.platforms).toEqual(["android", "ios"]);
    expect(update.intent?.channels).toEqual(["meta", "google"]);
  });

  it("accepts low confidence with populated doubts on a vague request", async () => {
    mockHaikuIntent({
      client: "globalcomix",
      platforms: ["android"],
      channels: ["meta"],
      period: { label: "recent", iso_start: null, iso_end: null },
      focus: null,
      confidence: 0.42,
      doubts: [
        "No client mentioned by name.",
        "No platforms or channels stated.",
        "No reporting period stated.",
      ],
    });
    const { parseIntent } = await import(
      "@/lib/agents/hermes/nodes/parse-intent"
    );
    const update = await parseIntent(
      makeState("Hey, can you put something together that shows how we're doing?"),
    );
    expect(update.intent?.confidence).toBeLessThan(0.5);
    expect(update.intent?.doubts?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it("retrieve fallback: a thrown retrieve does not block the run", async () => {
    retrieveMock.mockRejectedValueOnce(new Error("RAG temporarily offline"));
    mockHaikuIntent({
      client: "globalcomix",
      platforms: ["android"],
      channels: ["meta"],
      period: { label: "this past week", iso_start: null, iso_end: null },
      focus: null,
      confidence: 0.85,
      doubts: [],
    });
    const { parseIntent } = await import(
      "@/lib/agents/hermes/nodes/parse-intent"
    );
    const update = await parseIntent(
      makeState("Weekly review please for GlobalComix on Meta android."),
    );
    expect(update.intent?.client).toBe("globalcomix");
    expect(update.context?.comms).toEqual([]);
  });

  it("rememberSlice is called with parsed intent + email excerpt", async () => {
    mockHaikuIntent({
      client: "globalcomix",
      platforms: ["android"],
      channels: ["meta"],
      period: { label: "this past week", iso_start: null, iso_end: null },
      focus: null,
      confidence: 0.9,
      doubts: [],
    });
    const { parseIntent } = await import(
      "@/lib/agents/hermes/nodes/parse-intent"
    );
    await parseIntent(
      makeState("Weekly review please for GlobalComix on Meta android."),
    );
    expect(rememberSliceMock).toHaveBeenCalledTimes(1);
    const [scope, slice, payload] = rememberSliceMock.mock.calls[0];
    expect(scope).toBe("parse_intent");
    expect(slice).toBe("globalcomix");
    expect(payload).toMatchObject({ intent: { client: "globalcomix" } });
    expect((payload as { sample_email_excerpt: string }).sample_email_excerpt)
      .toContain("Weekly review");
  });

  it("client allowlist: unknown slug forces confidence under 0.5 + prepends a doubt", async () => {
    mockHaikuIntent({
      client: "competitor-corp",
      platforms: ["ios"],
      channels: ["meta"],
      period: { label: "this past week", iso_start: null, iso_end: null },
      focus: null,
      confidence: 0.94,
      doubts: [],
    });
    const { parseIntent } = await import(
      "@/lib/agents/hermes/nodes/parse-intent"
    );
    const update = await parseIntent(
      makeState("Weekly review please for CompetitorCorp on Meta iOS."),
    );
    expect(update.intent?.client).toBe("competitor-corp");
    expect(update.intent?.confidence).toBeLessThan(0.5);
    expect(update.intent?.doubts?.[0]).toMatch(/not on the known allowlist/);
  });

  it("client allowlist: known slug passes through untouched", async () => {
    mockHaikuIntent({
      client: "globalcomix",
      platforms: ["android"],
      channels: ["meta"],
      period: { label: "this past week", iso_start: null, iso_end: null },
      focus: null,
      confidence: 0.92,
      doubts: [],
    });
    const { parseIntent } = await import(
      "@/lib/agents/hermes/nodes/parse-intent"
    );
    const update = await parseIntent(
      makeState("Weekly review please for GlobalComix on Meta android."),
    );
    expect(update.intent?.client).toBe("globalcomix");
    expect(update.intent?.confidence).toBe(0.92);
    expect(update.intent?.doubts).toEqual([]);
  });

  it("rememberSlice failure is swallowed; the run still returns intent", async () => {
    rememberSliceMock.mockRejectedValueOnce(new Error("supabase down"));
    mockHaikuIntent({
      client: "globalcomix",
      platforms: ["android"],
      channels: ["meta"],
      period: { label: "this past week", iso_start: null, iso_end: null },
      focus: null,
      confidence: 0.9,
      doubts: [],
    });
    const { parseIntent } = await import(
      "@/lib/agents/hermes/nodes/parse-intent"
    );
    const update = await parseIntent(
      makeState("Weekly review please for GlobalComix on Meta android."),
    );
    expect(update.intent?.client).toBe("globalcomix");
  });
});
