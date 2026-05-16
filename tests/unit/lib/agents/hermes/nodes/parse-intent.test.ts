// @vitest-environment node
// Layer 2 (lib unit). File under test:
// src/lib/agents/hermes/nodes/parse-intent.ts. Verifies the node-level
// contract against the canonical Emily-style fixture, exercises both
// branches of pickClientFromEmail, and confirms the empty-comms +
// non-empty-comms paths.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const retrieveMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/rag/retrieve", () => ({
  retrieve: retrieveMock,
}));

class FakeAnthropic {
  messages = {
    create: vi.fn(),
  };
}

const fake = new FakeAnthropic();

const CANONICAL_FIXTURE = `Hi team,

Could you send over the weekly review for GlobalComix? I'm mostly interested in how iOS is doing on Meta this past week; we saw the dashboards move and want a narrative we can share with the client tomorrow.

Thanks,
Emily`;

const CANONICAL_INTENT = {
  client: "globalcomix",
  platforms: ["ios"],
  channels: ["meta"],
  period: {
    label: "this past week",
    iso_start: "2026-05-04",
    iso_end: "2026-05-10",
  },
  focus: "how iOS is doing on Meta",
  confidence: 0.92,
  doubts: [],
};

function mockHaiku(input: unknown) {
  return {
    content: [
      {
        type: "tool_use",
        name: "extract_intent",
        id: "toolu_test",
        input,
      },
    ],
  };
}

function emptyRetrieve() {
  return {
    chunks: [],
    citations: [],
    chunks_returned: 0,
    latency_ms: 0,
    query_embedding_cost_usd: 0,
  };
}

beforeEach(async () => {
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  fake.messages.create.mockReset();
  retrieveMock.mockReset();
  retrieveMock.mockResolvedValue(emptyRetrieve());
  const mod = await import("@/lib/agents/_scaffold/model");
  mod.__setAnthropicClientForTesting(fake as never);
});

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  const mod = await import("@/lib/agents/_scaffold/model");
  mod.__setAnthropicClientForTesting(null);
});

describe("parseIntent", () => {
  it("extracts intent from the canonical Emily fixture", async () => {
    fake.messages.create.mockResolvedValueOnce(mockHaiku(CANONICAL_INTENT));
    const { parseIntent } = await import(
      "@/lib/agents/hermes/nodes/parse-intent"
    );
    const update = await parseIntent({
      email_text: CANONICAL_FIXTURE,
      run_id: "run-1",
      intent: null,
      context: { knowledge: [], history: [], comms: [] },
      findings: [],
      bullets: [],
      user_id: null,
      snapshot: null,
      deck: { pptx_path: null, slides: [], report_id: null },
      approval: {
        approved: false,
        approved_by: null,
        approved_at: null,
        edits: [],
      },
      history: [],
    });
    expect(update.intent?.client).toBe("globalcomix");
    expect(update.intent?.platforms).toEqual(["ios"]);
    expect(update.intent?.channels).toEqual(["meta"]);
    expect(update.intent?.confidence).toBeGreaterThan(0.85);
    expect(update.history?.[0]).toMatchObject({ node: "parse_intent" });
  });

  it("scopes the Comms retrieve to a detected client slug", async () => {
    fake.messages.create.mockResolvedValueOnce(mockHaiku(CANONICAL_INTENT));
    const { parseIntent } = await import(
      "@/lib/agents/hermes/nodes/parse-intent"
    );
    await parseIntent({
      email_text: CANONICAL_FIXTURE,
      run_id: "run-2",
      intent: null,
      context: { knowledge: [], history: [], comms: [] },
      findings: [],
      bullets: [],
      user_id: null,
      snapshot: null,
      deck: { pptx_path: null, slides: [], report_id: null },
      approval: {
        approved: false,
        approved_by: null,
        approved_at: null,
        edits: [],
      },
      history: [],
    });
    expect(retrieveMock).toHaveBeenCalledWith(
      expect.objectContaining({
        corpus: "comms",
        filters: { client: "globalcomix" },
      }),
    );
  });

  it("retrieves without a client filter when none can be detected", async () => {
    fake.messages.create.mockResolvedValueOnce(mockHaiku(CANONICAL_INTENT));
    const { parseIntent } = await import(
      "@/lib/agents/hermes/nodes/parse-intent"
    );
    await parseIntent({
      email_text: "Generic email body that names no recognised client.",
      run_id: "run-3",
      intent: null,
      context: { knowledge: [], history: [], comms: [] },
      findings: [],
      bullets: [],
      user_id: null,
      snapshot: null,
      deck: { pptx_path: null, slides: [], report_id: null },
      approval: {
        approved: false,
        approved_by: null,
        approved_at: null,
        edits: [],
      },
      history: [],
    });
    expect(retrieveMock).toHaveBeenCalledWith(
      expect.objectContaining({ corpus: "comms", filters: {} }),
    );
  });

  it("threads non-empty comms chunks into the prompt context", async () => {
    retrieveMock.mockResolvedValueOnce({
      chunks: [
        {
          chunk_id: "abc-0",
          source_path: "comms/thread-1",
          content: "Emily usually asks about Meta first.",
          similarity: 0.7,
          metadata: {},
        },
      ],
      citations: [{ source_path: "comms/thread-1", chunk_id: "abc-0" }],
      chunks_returned: 1,
      latency_ms: 100,
      query_embedding_cost_usd: 0.00001,
    });
    fake.messages.create.mockResolvedValueOnce(mockHaiku(CANONICAL_INTENT));
    const { parseIntent } = await import(
      "@/lib/agents/hermes/nodes/parse-intent"
    );
    const update = await parseIntent({
      email_text: CANONICAL_FIXTURE,
      run_id: "run-4",
      intent: null,
      context: { knowledge: [], history: [], comms: [] },
      findings: [],
      bullets: [],
      user_id: null,
      snapshot: null,
      deck: { pptx_path: null, slides: [], report_id: null },
      approval: {
        approved: false,
        approved_by: null,
        approved_at: null,
        edits: [],
      },
      history: [],
    });
    expect(update.context?.comms).toHaveLength(1);
    expect(update.context?.comms[0].chunk_id).toBe("abc-0");
    const callArgs = fake.messages.create.mock.calls[0][0];
    expect(callArgs.messages[0].content).toContain(
      "Emily usually asks about Meta first.",
    );
    expect(callArgs.messages[0].content).toContain("<comms>");
  });

  it("tolerates Haiku omitting focus + doubts in the tool output", async () => {
    fake.messages.create.mockResolvedValueOnce(
      mockHaiku({
        client: "globalcomix",
        platforms: ["ios"],
        channels: ["meta"],
        period: { label: "this week", iso_start: null, iso_end: null },
        confidence: 0.8,
      }),
    );
    const { parseIntent } = await import(
      "@/lib/agents/hermes/nodes/parse-intent"
    );
    const update = await parseIntent({
      email_text: CANONICAL_FIXTURE,
      run_id: "run-5",
      intent: null,
      context: { knowledge: [], history: [], comms: [] },
      findings: [],
      bullets: [],
      user_id: null,
      snapshot: null,
      deck: { pptx_path: null, slides: [], report_id: null },
      approval: {
        approved: false,
        approved_by: null,
        approved_at: null,
        edits: [],
      },
      history: [],
    });
    expect(update.intent?.client).toBe("globalcomix");
    expect(update.intent?.doubts).toEqual([]);
  });
});
