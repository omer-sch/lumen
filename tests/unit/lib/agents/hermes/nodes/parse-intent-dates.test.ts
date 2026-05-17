// @vitest-environment node
// Layer 2 (lib unit). Files under test:
//   src/lib/agents/hermes/nodes/parse-intent.ts
//   src/lib/agents/hermes/prompts/parse-intent.prompt.ts
//
// WS6 date-extraction guarantees:
//   - extractIsoDateHints pulls unique ISO tokens from a body
//   - validateIntentDates rejects malformed / out-of-order ranges
//   - the user message carries <today> and <iso_hints> blocks
//   - on a bad-ISO response the node re-prompts once and falls back
//     to null on a second failure

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const retrieveMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/rag/retrieve", () => ({ retrieve: retrieveMock }));
vi.mock("@/lib/contacts", () => ({ getContactByEmail: vi.fn() }));
vi.mock("@/lib/agents/_scaffold/memory", () => ({
  rememberSlice: vi.fn().mockResolvedValue(undefined),
}));

class FakeAnthropic {
  messages = { create: vi.fn() };
}
const fake = new FakeAnthropic();

beforeEach(async () => {
  retrieveMock.mockReset();
  retrieveMock.mockResolvedValue({
    chunks: [],
    citations: [],
    chunks_returned: 0,
    latency_ms: 0,
    query_embedding_cost_usd: 0,
  });
  fake.messages.create.mockReset();
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  const mod = await import("@/lib/agents/_scaffold/model");
  mod.__setAnthropicClientForTesting(fake as never);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  const mod = await import("@/lib/agents/_scaffold/model");
  mod.__setAnthropicClientForTesting(null);
});

function toolResp(input: unknown) {
  return {
    content: [{ type: "tool_use", name: "extract_intent", input }],
  };
}

describe("extractIsoDateHints", () => {
  it("extracts unique YYYY-MM-DD tokens, sorted", async () => {
    const { extractIsoDateHints } = await import(
      "@/lib/agents/hermes/nodes/parse-intent"
    );
    const out = extractIsoDateHints(
      "Pull GlobalComix for 2026-04-01 to 2026-04-30, compare to 2026-04-01 baseline.",
    );
    expect(out).toEqual(["2026-04-01", "2026-04-30"]);
  });

  it("returns [] when the body has no ISO tokens", async () => {
    const { extractIsoDateHints } = await import(
      "@/lib/agents/hermes/nodes/parse-intent"
    );
    expect(extractIsoDateHints("Send last week's review.")).toEqual([]);
  });

  it("rejects malformed near-matches", async () => {
    const { extractIsoDateHints } = await import(
      "@/lib/agents/hermes/nodes/parse-intent"
    );
    // 2026-13-01 (invalid month), 2026-04-32 (invalid day), 26-04-01 (short year).
    expect(
      extractIsoDateHints("2026-13-01 / 2026-04-32 / 26-04-01"),
    ).toEqual([]);
  });
});

describe("validateIntentDates", () => {
  function intent(over: Partial<{ iso_start: string | null; iso_end: string | null }>) {
    return {
      client: "globalcomix",
      platforms: ["ios" as const],
      channels: ["meta" as const],
      period: {
        label: "test",
        iso_start: over.iso_start ?? null,
        iso_end: over.iso_end ?? null,
      },
      focus: null,
      confidence: 0.9,
      doubts: [],
    };
  }

  it("accepts both-null", async () => {
    const { validateIntentDates } = await import(
      "@/lib/agents/hermes/nodes/parse-intent"
    );
    expect(validateIntentDates(intent({}))).toBeNull();
  });

  it("accepts a valid ISO range", async () => {
    const { validateIntentDates } = await import(
      "@/lib/agents/hermes/nodes/parse-intent"
    );
    expect(
      validateIntentDates(
        intent({ iso_start: "2026-04-01", iso_end: "2026-04-30" }),
      ),
    ).toBeNull();
  });

  it("rejects start-only / end-only", async () => {
    const { validateIntentDates } = await import(
      "@/lib/agents/hermes/nodes/parse-intent"
    );
    expect(validateIntentDates(intent({ iso_start: "2026-04-01" }))).toMatch(
      /both be present or both be null/,
    );
    expect(validateIntentDates(intent({ iso_end: "2026-04-30" }))).toMatch(
      /both be present or both be null/,
    );
  });

  it("rejects end < start", async () => {
    const { validateIntentDates } = await import(
      "@/lib/agents/hermes/nodes/parse-intent"
    );
    expect(
      validateIntentDates(
        intent({ iso_start: "2026-04-30", iso_end: "2026-04-01" }),
      ),
    ).toMatch(/before iso_start/);
  });

  it("rejects malformed ISO", async () => {
    const { validateIntentDates } = await import(
      "@/lib/agents/hermes/nodes/parse-intent"
    );
    expect(
      validateIntentDates(
        intent({ iso_start: "2026/04/01", iso_end: "2026-04-30" }),
      ),
    ).toMatch(/not a valid ISO/);
  });
});

describe("parse_intent user message", () => {
  it("carries <today> and <iso_hints> blocks", async () => {
    fake.messages.create.mockResolvedValueOnce(
      toolResp({
        client: "globalcomix",
        platforms: ["ios"],
        channels: ["meta"],
        period: {
          label: "April 2026",
          iso_start: "2026-04-01",
          iso_end: "2026-04-30",
        },
        focus: null,
        confidence: 0.92,
        doubts: [],
      }),
    );
    const { parseIntent } = await import(
      "@/lib/agents/hermes/nodes/parse-intent"
    );
    await parseIntent({
      email_text:
        "Hi team, please pull GlobalComix April 2026 numbers (2026-04-01 to 2026-04-30) on iOS Meta.",
      action_notes: null,
      run_id: "test-run",
      user_id: "test-user",
      intent: null,
      context: { knowledge: [], history: [], comms: [] },
      contact: null,
      findings: [],
      snapshot: null,
      bullets: [],
      deck: { pptx_path: null, slides: [], report_id: null },
      approval: { approved: false, approved_by: null, approved_at: null, edits: [] },
      history: [],
    } as never);

    const call = fake.messages.create.mock.calls[0][0] as {
      messages: { content: string }[];
    };
    const userMsg = call.messages[0].content;
    expect(userMsg).toMatch(/<today>\d{4}-\d{2}-\d{2}<\/today>/);
    expect(userMsg).toMatch(/<iso_hints>/);
    expect(userMsg).toMatch(/2026-04-01/);
    expect(userMsg).toMatch(/2026-04-30/);
  });

  it("re-prompts once when the first response has malformed ISO, falls back to null on a second failure", async () => {
    // First call: bogus iso_end (before iso_start). Second call:
    // still bogus. The node should fall back to nulled period.
    fake.messages.create
      .mockResolvedValueOnce(
        toolResp({
          client: "globalcomix",
          platforms: ["ios"],
          channels: ["meta"],
          period: {
            label: "April 2026",
            iso_start: "2026-04-30",
            iso_end: "2026-04-01",
          },
          focus: null,
          confidence: 0.92,
          doubts: [],
        }),
      )
      .mockResolvedValueOnce(
        toolResp({
          client: "globalcomix",
          platforms: ["ios"],
          channels: ["meta"],
          period: {
            label: "April 2026",
            iso_start: "not-a-date",
            iso_end: "2026-04-30",
          },
          focus: null,
          confidence: 0.92,
          doubts: [],
        }),
      );
    const { parseIntent } = await import(
      "@/lib/agents/hermes/nodes/parse-intent"
    );
    const update = await parseIntent({
      email_text: "Pull GlobalComix April 2026 numbers on iOS Meta.",
      action_notes: null,
      run_id: "test-run-2",
      user_id: "test-user",
      intent: null,
      context: { knowledge: [], history: [], comms: [] },
      contact: null,
      findings: [],
      snapshot: null,
      bullets: [],
      deck: { pptx_path: null, slides: [], report_id: null },
      approval: { approved: false, approved_by: null, approved_at: null, edits: [] },
      history: [],
    } as never);
    expect(fake.messages.create).toHaveBeenCalledTimes(2);
    expect(update.intent?.period.iso_start).toBeNull();
    expect(update.intent?.period.iso_end).toBeNull();
    expect(update.intent?.doubts.some((d) => /Date extraction failed twice/.test(d))).toBe(true);
  });

  it("accepts a valid response on the first try without re-prompting", async () => {
    fake.messages.create.mockResolvedValueOnce(
      toolResp({
        client: "globalcomix",
        platforms: ["ios"],
        channels: ["meta"],
        period: {
          label: "April 2026",
          iso_start: "2026-04-01",
          iso_end: "2026-04-30",
        },
        focus: null,
        confidence: 0.92,
        doubts: [],
      }),
    );
    const { parseIntent } = await import(
      "@/lib/agents/hermes/nodes/parse-intent"
    );
    const update = await parseIntent({
      email_text: "Pull GlobalComix April 2026 numbers on iOS Meta.",
      action_notes: null,
      run_id: "test-run-3",
      user_id: "test-user",
      intent: null,
      context: { knowledge: [], history: [], comms: [] },
      contact: null,
      findings: [],
      snapshot: null,
      bullets: [],
      deck: { pptx_path: null, slides: [], report_id: null },
      approval: { approved: false, approved_by: null, approved_at: null, edits: [] },
      history: [],
    } as never);
    expect(fake.messages.create).toHaveBeenCalledTimes(1);
    expect(update.intent?.period.iso_start).toBe("2026-04-01");
    expect(update.intent?.period.iso_end).toBe("2026-04-30");
  });
});
