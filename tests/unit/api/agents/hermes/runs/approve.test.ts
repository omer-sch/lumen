// Layer 3 (API route-handler). File under test:
// src/app/api/agents/hermes/runs/[runId]/approve/route.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildRequest } from "../../../_lib/route-test-utils";

const authMock = vi.hoisted(() => vi.fn());
const getRunMock = vi.hoisted(() => vi.fn());
const updateMock = vi.hoisted(() => vi.fn());
const fromMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("@/lib/agents/_scaffold/run", () => ({
  getRun: getRunMock,
  startRun: vi.fn(),
  completeRun: vi.fn(),
  failRun: vi.fn(),
  updateRunStep: vi.fn(),
}));
vi.mock("@/lib/db/client", () => ({
  supabaseAdmin: () => ({ from: fromMock }),
}));

beforeEach(() => {
  authMock.mockReset();
  getRunMock.mockReset();
  updateMock.mockReset();
  fromMock.mockReset();
  fromMock.mockReturnValue({ update: () => ({ eq: updateMock }) });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const completedRun = {
  id: "run-abc",
  agentId: "hermes",
  status: "completed" as const,
  client: "globalcomix",
  startedAt: "2026-05-15T10:00:00Z",
  completedAt: "2026-05-15T10:00:30Z",
  step: null,
  progress: 100,
  input: null,
  output: { bullets: [], approval: { approved: false } } as Record<string, unknown>,
  error: null,
};

describe("POST /api/agents/hermes/runs/[runId]/approve", () => {
  it("401 when not signed in", async () => {
    authMock.mockResolvedValue({ userId: null });
    const { POST } = await import(
      "@/app/api/agents/hermes/runs/[runId]/approve/route"
    );
    const res = await POST(
      buildRequest("/api/agents/hermes/runs/run-abc/approve", {
        method: "POST",
      }),
      { params: Promise.resolve({ runId: "run-abc" }) },
    );
    expect(res.status).toBe(401);
    expect(getRunMock).not.toHaveBeenCalled();
  });

  it("404 when run doesn't exist", async () => {
    authMock.mockResolvedValue({ userId: "u1" });
    getRunMock.mockResolvedValue(null);
    const { POST } = await import(
      "@/app/api/agents/hermes/runs/[runId]/approve/route"
    );
    const res = await POST(
      buildRequest("/api/agents/hermes/runs/run-abc/approve", {
        method: "POST",
      }),
      { params: Promise.resolve({ runId: "run-abc" }) },
    );
    expect(res.status).toBe(404);
  });

  it("404 when run isn't a Hermes run", async () => {
    authMock.mockResolvedValue({ userId: "u1" });
    getRunMock.mockResolvedValue({ ...completedRun, agentId: "aria" });
    const { POST } = await import(
      "@/app/api/agents/hermes/runs/[runId]/approve/route"
    );
    const res = await POST(
      buildRequest("/api/agents/hermes/runs/run-abc/approve", {
        method: "POST",
      }),
      { params: Promise.resolve({ runId: "run-abc" }) },
    );
    expect(res.status).toBe(404);
  });

  it("409 when run isn't yet completed", async () => {
    authMock.mockResolvedValue({ userId: "u1" });
    getRunMock.mockResolvedValue({ ...completedRun, status: "running" });
    const { POST } = await import(
      "@/app/api/agents/hermes/runs/[runId]/approve/route"
    );
    const res = await POST(
      buildRequest("/api/agents/hermes/runs/run-abc/approve", {
        method: "POST",
      }),
      { params: Promise.resolve({ runId: "run-abc" }) },
    );
    expect(res.status).toBe(409);
  });

  it("happy path: stamps approval and returns the timestamps", async () => {
    authMock.mockResolvedValue({ userId: "u1" });
    getRunMock.mockResolvedValue(completedRun);
    updateMock.mockResolvedValue({ error: null });
    const { POST } = await import(
      "@/app/api/agents/hermes/runs/[runId]/approve/route"
    );
    const res = await POST(
      buildRequest("/api/agents/hermes/runs/run-abc/approve", {
        method: "POST",
      }),
      { params: Promise.resolve({ runId: "run-abc" }) },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      approved: boolean;
      approved_by: string;
    };
    expect(body.approved).toBe(true);
    expect(body.approved_by).toBe("u1");
  });

  it("500 when the Supabase update fails", async () => {
    authMock.mockResolvedValue({ userId: "u1" });
    getRunMock.mockResolvedValue(completedRun);
    updateMock.mockResolvedValue({ error: { message: "rls" } });
    const { POST } = await import(
      "@/app/api/agents/hermes/runs/[runId]/approve/route"
    );
    const res = await POST(
      buildRequest("/api/agents/hermes/runs/run-abc/approve", {
        method: "POST",
      }),
      { params: Promise.resolve({ runId: "run-abc" }) },
    );
    expect(res.status).toBe(500);
  });
});
