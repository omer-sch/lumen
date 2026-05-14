// Layer 3 (API route-handler). File under test:
// src/app/api/agents/[agentId]/memory/route.ts. Priority: P1.
// Stores per-user feedback on agent runs ("memory"). Validates the agent
// id against the known roster (aria / max / nova), enforces text length,
// and translates the lib's typed errors to the right HTTP status.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildRequest, expectJson } from "../_lib/route-test-utils";

const { listFeedbackForAgent, addFeedback, getUserId, isSupabaseConfigured } = vi.hoisted(() => ({
  listFeedbackForAgent: vi.fn(),
  addFeedback: vi.fn(),
  getUserId: vi.fn(),
  isSupabaseConfigured: vi.fn(),
}));


// Use the real error classes so the route's `instanceof` checks fire.
vi.mock("@/lib/db/agent-feedback", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/db/agent-feedback")
  >("@/lib/db/agent-feedback");
  return { ...actual, listFeedbackForAgent, addFeedback };
});
vi.mock("@/lib/db/user", () => ({ getUserId }));
vi.mock("@/lib/env.server", async () => {
  const actual = await vi.importActual<typeof import("@/lib/env.server")>(
    "@/lib/env.server",
  );
  return { ...actual, isSupabaseConfigured };
});

beforeEach(() => {
  vi.resetModules();
  listFeedbackForAgent.mockReset();
  addFeedback.mockReset();
  getUserId.mockReset();
  isSupabaseConfigured.mockReset();
  getUserId.mockResolvedValue("user_test");
});

afterEach(() => vi.restoreAllMocks());

const ariaCtx = { params: Promise.resolve({ agentId: "aria" }) };
const unknownCtx = { params: Promise.resolve({ agentId: "ghost" }) };

const VALID_BODY = {
  runId: "run-1",
  note: "Nailed the CPI breakdown — keep doing that",
  rating: "thumbs-up" as const,
};

describe("GET /api/agents/[agentId]/memory", () => {
  it("returns the entries when agent + Supabase are both wired", async () => {
    isSupabaseConfigured.mockReturnValue(true);
    listFeedbackForAgent.mockResolvedValue([{ id: "f1", note: "good" }]);
    const { GET } = await import(
      "@/app/api/agents/[agentId]/memory/route"
    );
    const res = await GET(buildRequest("/api/agents/aria/memory"), ariaCtx);
    const body = await expectJson<{ entries: unknown[] }>(res, 200);
    expect(body.entries).toHaveLength(1);
  });

  it("returns { entries: [] } for an unknown agent id (no error)", async () => {
    isSupabaseConfigured.mockReturnValue(true);
    const { GET } = await import(
      "@/app/api/agents/[agentId]/memory/route"
    );
    const res = await GET(
      buildRequest("/api/agents/ghost/memory"),
      unknownCtx,
    );
    const body = await expectJson<{ entries: unknown[] }>(res, 200);
    expect(body.entries).toEqual([]);
    expect(listFeedbackForAgent).not.toHaveBeenCalled();
  });

  it("returns { entries: [] } when Supabase is not configured", async () => {
    isSupabaseConfigured.mockReturnValue(false);
    const { GET } = await import(
      "@/app/api/agents/[agentId]/memory/route"
    );
    const res = await GET(buildRequest("/api/agents/aria/memory"), ariaCtx);
    const body = await expectJson<{ entries: unknown[] }>(res, 200);
    expect(body.entries).toEqual([]);
  });
});

describe("POST /api/agents/[agentId]/memory", () => {
  it("returns 200 + persisted=true on the happy path", async () => {
    isSupabaseConfigured.mockReturnValue(true);
    addFeedback.mockResolvedValue(undefined);
    const { POST } = await import(
      "@/app/api/agents/[agentId]/memory/route"
    );
    const res = await POST(
      buildRequest("/api/agents/aria/memory", {
        method: "POST",
        body: VALID_BODY,
      }),
      ariaCtx,
    );
    const body = await expectJson<{ persisted: boolean }>(res, 200);
    expect(body.persisted).toBe(true);
  });

  it("returns 404 for an unknown agent id", async () => {
    const { POST } = await import(
      "@/app/api/agents/[agentId]/memory/route"
    );
    const res = await POST(
      buildRequest("/api/agents/ghost/memory", {
        method: "POST",
        body: VALID_BODY,
      }),
      unknownCtx,
    );
    const body = await expectJson<{ error: string }>(res, 404);
    expect(body.error).toMatch(/unknown agent/);
  });

  it("returns 400 when the JSON body is malformed", async () => {
    const { POST } = await import(
      "@/app/api/agents/[agentId]/memory/route"
    );
    const res = await POST(
      buildRequest("/api/agents/aria/memory", {
        method: "POST",
        body: "{not json",
      }),
      ariaCtx,
    );
    const body = await expectJson<{ error: string }>(res, 400);
    expect(body.error).toMatch(/invalid JSON body/);
  });

  it("returns 400 when runId is missing", async () => {
    const { POST } = await import(
      "@/app/api/agents/[agentId]/memory/route"
    );
    const res = await POST(
      buildRequest("/api/agents/aria/memory", {
        method: "POST",
        body: { note: "x" },
      }),
      ariaCtx,
    );
    const body = await expectJson<{ error: string }>(res, 400);
    expect(body.error).toMatch(/runId required/);
  });

  it("returns 400 when note is longer than MAX_FEEDBACK_TEXT_LENGTH", async () => {
    isSupabaseConfigured.mockReturnValue(true);
    const { MAX_FEEDBACK_TEXT_LENGTH } = await import(
      "@/lib/db/agent-feedback"
    );
    const { POST } = await import(
      "@/app/api/agents/[agentId]/memory/route"
    );
    const res = await POST(
      buildRequest("/api/agents/aria/memory", {
        method: "POST",
        body: { runId: "r1", note: "x".repeat(MAX_FEEDBACK_TEXT_LENGTH + 1) },
      }),
      ariaCtx,
    );
    const body = await expectJson<{ error: string }>(res, 400);
    expect(body.error).toMatch(/note exceeds/);
  });

  it("returns 403 when the lib throws FeedbackForbiddenError", async () => {
    isSupabaseConfigured.mockReturnValue(true);
    const { FeedbackForbiddenError } = await import(
      "@/lib/db/agent-feedback"
    );
    addFeedback.mockImplementation(async () => { throw new FeedbackForbiddenError("nope"); });
    const { POST } = await import(
      "@/app/api/agents/[agentId]/memory/route"
    );
    const res = await POST(
      buildRequest("/api/agents/aria/memory", {
        method: "POST",
        body: VALID_BODY,
      }),
      ariaCtx,
    );
    const body = await expectJson<{ error: string }>(res, 403);
    expect(body.error).toMatch(/Forbidden/);
  });

  it("returns 400 when the lib throws FeedbackValidationError", async () => {
    isSupabaseConfigured.mockReturnValue(true);
    const { FeedbackValidationError } = await import(
      "@/lib/db/agent-feedback"
    );
    addFeedback.mockImplementation(async () => { throw new FeedbackValidationError("bad rating"); });
    const { POST } = await import(
      "@/app/api/agents/[agentId]/memory/route"
    );
    const res = await POST(
      buildRequest("/api/agents/aria/memory", {
        method: "POST",
        body: VALID_BODY,
      }),
      ariaCtx,
    );
    const body = await expectJson<{ error: string }>(res, 400);
    expect(body.error).toMatch(/bad rating/);
  });
});
