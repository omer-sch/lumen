// Layer 2 (lib unit). File under test:
// src/lib/agents/_scaffold/run.ts. Supabase chain is mocked via a
// self-chaining proxy.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const insertSelectSingle = vi.hoisted(() => vi.fn());
const updateEq = vi.hoisted(() => vi.fn());
const selectEqMaybeSingle = vi.hoisted(() => vi.fn());

const supabaseChain: Record<string, unknown> = {};
supabaseChain.from = () => supabaseChain;
supabaseChain.insert = () => ({ select: () => ({ single: insertSelectSingle }) });
supabaseChain.update = () => ({ eq: updateEq });
supabaseChain.select = () => ({
  eq: () => ({ maybeSingle: selectEqMaybeSingle }),
});

vi.mock("@/lib/db/client", () => ({
  supabaseAdmin: () => supabaseChain,
}));

beforeEach(() => {
  insertSelectSingle.mockReset();
  updateEq.mockReset();
  selectEqMaybeSingle.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("startRun", () => {
  it("inserts a row with status=running and returns the mapped record", async () => {
    insertSelectSingle.mockResolvedValueOnce({
      data: {
        id: "run-1",
        agent_id: "hermes",
        status: "running",
        client: "globalcomix",
        started_at: "2026-05-15T10:00:00Z",
        completed_at: null,
        step: null,
        progress: null,
        input: { email: "x" },
        output: null,
        error: null,
      },
      error: null,
    });
    const { startRun } = await import("@/lib/agents/_scaffold/run");
    const r = await startRun({
      agentId: "hermes",
      client: "globalcomix",
      input: { email: "x" },
    });
    expect(r.id).toBe("run-1");
    expect(r.agentId).toBe("hermes");
    expect(r.status).toBe("running");
    expect(r.client).toBe("globalcomix");
    expect(r.input).toEqual({ email: "x" });
  });

  it("throws when Supabase returns an error", async () => {
    insertSelectSingle.mockResolvedValueOnce({
      data: null,
      error: { message: "FK violation" },
    });
    const { startRun } = await import("@/lib/agents/_scaffold/run");
    await expect(startRun({ agentId: "hermes" })).rejects.toThrow(
      /FK violation/,
    );
  });
});

describe("updateRunStep", () => {
  it("updates step + progress on the agent_runs row", async () => {
    updateEq.mockResolvedValueOnce({ error: null });
    const { updateRunStep } = await import("@/lib/agents/_scaffold/run");
    await updateRunStep("run-1", "analyze", 50);
    expect(updateEq).toHaveBeenCalledTimes(1);
  });

  it("surfaces Supabase errors", async () => {
    updateEq.mockResolvedValueOnce({ error: { message: "RLS denied" } });
    const { updateRunStep } = await import("@/lib/agents/_scaffold/run");
    await expect(updateRunStep("run-1", "analyze")).rejects.toThrow(
      /RLS denied/,
    );
  });
});

describe("completeRun", () => {
  it("sets status=completed and writes the output (this trips the History trigger)", async () => {
    updateEq.mockResolvedValueOnce({ error: null });
    const { completeRun } = await import("@/lib/agents/_scaffold/run");
    await completeRun(
      "run-1",
      { bullets: ["a", "b"] },
      { score: 0.9, note: "happy path" },
    );
    expect(updateEq).toHaveBeenCalledTimes(1);
  });
});

describe("failRun", () => {
  it("sets status=failed and writes the error", async () => {
    updateEq.mockResolvedValueOnce({ error: null });
    const { failRun } = await import("@/lib/agents/_scaffold/run");
    await failRun("run-1", "BQ scan timeout");
    expect(updateEq).toHaveBeenCalledTimes(1);
  });
});

describe("getRun", () => {
  it("returns the mapped record when found", async () => {
    selectEqMaybeSingle.mockResolvedValueOnce({
      data: {
        id: "run-1",
        agent_id: "hermes",
        status: "completed",
        client: null,
        started_at: "2026-05-15T10:00:00Z",
        completed_at: "2026-05-15T10:01:00Z",
        step: null,
        progress: 100,
        input: null,
        output: { bullets: [] },
        error: null,
      },
      error: null,
    });
    const { getRun } = await import("@/lib/agents/_scaffold/run");
    const r = await getRun("run-1");
    expect(r?.id).toBe("run-1");
    expect(r?.status).toBe("completed");
    expect(r?.output).toEqual({ bullets: [] });
  });

  it("returns null when the row is absent", async () => {
    selectEqMaybeSingle.mockResolvedValueOnce({ data: null, error: null });
    const { getRun } = await import("@/lib/agents/_scaffold/run");
    expect(await getRun("nope")).toBeNull();
  });
});
