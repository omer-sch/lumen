// Layer 3 (API route-handler). File under test:
// src/app/api/agents/hermes/generate/route.ts. The graph + scaffold
// are mocked; this only verifies auth, validation, and the
// startRun -> completeRun / failRun flow.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildRequest } from "../../_lib/route-test-utils";

const requireAuthMock = vi.hoisted(() => vi.fn());
const startRunMock = vi.hoisted(() => vi.fn());
const completeRunMock = vi.hoisted(() => vi.fn());
const failRunMock = vi.hoisted(() => vi.fn());
const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/agents/_scaffold/auth", () => ({
  requireAgentAuth: requireAuthMock,
}));

vi.mock("@/lib/agents/_scaffold/run", () => ({
  startRun: startRunMock,
  completeRun: completeRunMock,
  failRun: failRunMock,
  updateRunStep: vi.fn(),
  getRun: vi.fn(),
}));

vi.mock("@/lib/agents/hermes/graph", () => ({
  buildHermesGraph: () => ({ invoke: invokeMock }),
}));

beforeEach(() => {
  requireAuthMock.mockReset();
  startRunMock.mockReset();
  completeRunMock.mockReset();
  failRunMock.mockReset();
  invokeMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const validEmail =
  "Hi team, please send us a weekly review for GlobalComix focused on Meta android.";

describe("POST /api/agents/hermes/generate", () => {
  it("returns 401 when there is no Clerk session", async () => {
    requireAuthMock.mockResolvedValue({
      ok: false,
      status: 401,
      error: "Unauthorized",
    });
    const { POST } = await import("@/app/api/agents/hermes/generate/route");
    const res = await POST(
      buildRequest("/api/agents/hermes/generate", {
        method: "POST",
        body: { email_text: validEmail },
      }),
    );
    expect(res.status).toBe(401);
    expect(startRunMock).not.toHaveBeenCalled();
  });

  it("returns 429 with Retry-After when rate-limited", async () => {
    requireAuthMock.mockResolvedValue({
      ok: false,
      status: 429,
      error: "Rate limit",
      retryAfterSeconds: 42,
    });
    const { POST } = await import("@/app/api/agents/hermes/generate/route");
    const res = await POST(
      buildRequest("/api/agents/hermes/generate", {
        method: "POST",
        body: { email_text: validEmail },
      }),
    );
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("42");
  });

  it("returns 400 on invalid JSON", async () => {
    requireAuthMock.mockResolvedValue({ ok: true, userId: "u" });
    const { POST } = await import("@/app/api/agents/hermes/generate/route");
    const res = await POST(
      buildRequest("/api/agents/hermes/generate", {
        method: "POST",
        body: "{ not json",
        headers: { "content-type": "application/json" },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("returns 400 on too-short email_text", async () => {
    requireAuthMock.mockResolvedValue({ ok: true, userId: "u" });
    const { POST } = await import("@/app/api/agents/hermes/generate/route");
    const res = await POST(
      buildRequest("/api/agents/hermes/generate", {
        method: "POST",
        body: { email_text: "too short" },
      }),
    );
    expect(res.status).toBe(400);
  });

  it("runs the graph and completes the run on the happy path", async () => {
    requireAuthMock.mockResolvedValue({ ok: true, userId: "u" });
    startRunMock.mockResolvedValueOnce({
      id: "run-1",
      agentId: "hermes",
      status: "running",
      client: null,
      startedAt: "2026-05-15T10:00:00Z",
      completedAt: null,
      step: null,
      progress: null,
      input: { email_text: validEmail },
      output: null,
      error: null,
    });
    invokeMock.mockResolvedValueOnce({
      intent: {
        client: "globalcomix",
        platforms: ["android"],
        channels: ["meta"],
        period: { label: "last week", iso_start: null, iso_end: null },
        focus: null,
        confidence: 0.9,
        doubts: [],
      },
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
    });
    completeRunMock.mockResolvedValueOnce(undefined);
    const { POST } = await import("@/app/api/agents/hermes/generate/route");
    const res = await POST(
      buildRequest("/api/agents/hermes/generate", {
        method: "POST",
        body: { email_text: validEmail },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { run_id: string; intent: { client: string } };
    expect(body.run_id).toBe("run-1");
    expect(body.intent.client).toBe("globalcomix");
    expect(startRunMock).toHaveBeenCalledTimes(1);
    expect(completeRunMock).toHaveBeenCalledTimes(1);
    expect(failRunMock).not.toHaveBeenCalled();
  });

  it("fails the run and returns 500 on graph error", async () => {
    requireAuthMock.mockResolvedValue({ ok: true, userId: "u" });
    startRunMock.mockResolvedValueOnce({
      id: "run-2",
      agentId: "hermes",
      status: "running",
      client: null,
      startedAt: "2026-05-15T10:00:00Z",
      completedAt: null,
      step: null,
      progress: null,
      input: null,
      output: null,
      error: null,
    });
    invokeMock.mockRejectedValueOnce(new Error("Haiku unavailable"));
    failRunMock.mockResolvedValueOnce(undefined);
    const { POST } = await import("@/app/api/agents/hermes/generate/route");
    const res = await POST(
      buildRequest("/api/agents/hermes/generate", {
        method: "POST",
        body: { email_text: validEmail },
      }),
    );
    expect(res.status).toBe(500);
    expect(failRunMock).toHaveBeenCalledWith("run-2", "Haiku unavailable");
  });
});
