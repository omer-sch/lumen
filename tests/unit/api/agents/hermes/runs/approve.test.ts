// Layer 3 (API route-handler). File under test:
// src/app/api/agents/hermes/runs/[runId]/approve/route.ts.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildRequest } from "../../../_lib/route-test-utils";

const getAdminUserIdMock = vi.hoisted(() => vi.fn());
const getRunMock = vi.hoisted(() => vi.fn());
const eqTerminalMock = vi.hoisted(() => vi.fn());
const eqChainMock = vi.hoisted(() => vi.fn());
const updateMock = vi.hoisted(() => vi.fn());
const fromMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/auth/admin", () => ({ getAdminUserId: getAdminUserIdMock }));
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
  getAdminUserIdMock.mockReset();
  getRunMock.mockReset();
  eqTerminalMock.mockReset();
  eqChainMock.mockReset();
  updateMock.mockReset();
  fromMock.mockReset();
  // Chain: from(...).update(...).eq("id", ...).eq("status", ...) returns a Promise.
  eqChainMock.mockImplementation(() => ({ eq: eqTerminalMock }));
  updateMock.mockImplementation(() => ({ eq: eqChainMock }));
  fromMock.mockReturnValue({ update: updateMock });
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
  it("403 when requester is not on the admin allowlist", async () => {
    getAdminUserIdMock.mockResolvedValue(null);
    const { POST } = await import(
      "@/app/api/agents/hermes/runs/[runId]/approve/route"
    );
    const res = await POST(
      buildRequest("/api/agents/hermes/runs/run-abc/approve", {
        method: "POST",
      }),
      { params: Promise.resolve({ runId: "run-abc" }) },
    );
    expect(res.status).toBe(403);
    expect(getRunMock).not.toHaveBeenCalled();
  });

  it("404 when run doesn't exist", async () => {
    getAdminUserIdMock.mockResolvedValue("u1");
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
    getAdminUserIdMock.mockResolvedValue("u1");
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
    getAdminUserIdMock.mockResolvedValue("u1");
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

  it("happy path: stamps approval, filters UPDATE on both id and status", async () => {
    getAdminUserIdMock.mockResolvedValue("u1");
    getRunMock.mockResolvedValue(completedRun);
    eqTerminalMock.mockResolvedValue({ error: null });
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
    // Belt-and-braces: the UPDATE filters on status=completed so a
    // concurrent transition can't clobber a not-completed run.
    expect(eqChainMock).toHaveBeenCalledWith("id", "run-abc");
    expect(eqTerminalMock).toHaveBeenCalledWith("status", "completed");
  });

  it("500 when the Supabase update fails", async () => {
    getAdminUserIdMock.mockResolvedValue("u1");
    getRunMock.mockResolvedValue(completedRun);
    eqTerminalMock.mockResolvedValue({ error: { message: "rls" } });
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
