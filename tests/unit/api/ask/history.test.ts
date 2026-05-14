// Layer 3 (API route-handler). File under test:
// src/app/api/ask/history/route.ts. Priority: P1.
// GET: pagination-clamped list of the user's past Ask queries.
// POST: append a new entry; degrades gracefully when Supabase isn't wired.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildRequest, expectJson } from "../_lib/route-test-utils";

const { listAskQueries, recordAskQuery, getUserId, isSupabaseConfigured } = vi.hoisted(() => ({
  listAskQueries: vi.fn(),
  recordAskQuery: vi.fn(),
  getUserId: vi.fn(),
  isSupabaseConfigured: vi.fn(),
}));


vi.mock("@/lib/db/ask", () => ({ listAskQueries, recordAskQuery }));
vi.mock("@/lib/db/user", () => ({ getUserId }));
vi.mock("@/lib/env.server", async () => {
  const actual = await vi.importActual<typeof import("@/lib/env.server")>(
    "@/lib/env.server",
  );
  return { ...actual, isSupabaseConfigured };
});

beforeEach(() => {
  vi.resetModules();
  listAskQueries.mockReset();
  recordAskQuery.mockReset();
  getUserId.mockReset();
  isSupabaseConfigured.mockReset();
  getUserId.mockResolvedValue("user_test");
});

afterEach(() => vi.restoreAllMocks());

describe("GET /api/ask/history", () => {
  it("returns the user's entries when Supabase is configured", async () => {
    isSupabaseConfigured.mockReturnValue(true);
    listAskQueries.mockResolvedValue([{ id: "a1", question: "show roas" }]);
    const { GET } = await import("@/app/api/ask/history/route");
    const res = await GET(buildRequest("/api/ask/history"));
    const body = await expectJson<{ entries: unknown[] }>(res, 200);
    expect(body.entries).toHaveLength(1);
    // Default limit = 20.
    expect(listAskQueries).toHaveBeenCalledWith("user_test", 20);
  });

  it("clamps limit to [1, 50]", async () => {
    isSupabaseConfigured.mockReturnValue(true);
    listAskQueries.mockResolvedValue([]);
    const { GET } = await import("@/app/api/ask/history/route");
    await GET(buildRequest("/api/ask/history?limit=999"));
    expect(listAskQueries).toHaveBeenCalledWith("user_test", 50);
    await GET(buildRequest("/api/ask/history?limit=0"));
    expect(listAskQueries).toHaveBeenLastCalledWith("user_test", 1);
  });

  it("returns { entries: [] } when Supabase is not configured", async () => {
    isSupabaseConfigured.mockReturnValue(false);
    const { GET } = await import("@/app/api/ask/history/route");
    const res = await GET(buildRequest("/api/ask/history"));
    const body = await expectJson<{ entries: unknown[] }>(res, 200);
    expect(body.entries).toEqual([]);
    expect(listAskQueries).not.toHaveBeenCalled();
  });
});

describe("POST /api/ask/history", () => {
  it("returns 200 + persisted=true with the new id", async () => {
    isSupabaseConfigured.mockReturnValue(true);
    recordAskQuery.mockResolvedValue({ id: "a1" });
    const { POST } = await import("@/app/api/ask/history/route");
    const res = await POST(
      buildRequest("/api/ask/history", {
        method: "POST",
        body: {
          answer: { question: "show roas", narration: "x", rationale: "y", config: { kind: "kpi" } },
        },
      }),
    );
    const body = await expectJson<{ id: string; persisted: boolean }>(res, 200);
    expect(body.persisted).toBe(true);
    expect(body.id).toBe("a1");
  });

  it("returns 400 when body.answer.question is missing", async () => {
    isSupabaseConfigured.mockReturnValue(true);
    const { POST } = await import("@/app/api/ask/history/route");
    const res = await POST(
      buildRequest("/api/ask/history", {
        method: "POST",
        body: { answer: { narration: "x" } },
      }),
    );
    const body = await expectJson<{ error: string }>(res, 400);
    expect(body.error).toMatch(/answer required/);
  });

  it("returns persisted=false when Supabase is not configured", async () => {
    isSupabaseConfigured.mockReturnValue(false);
    const { POST } = await import("@/app/api/ask/history/route");
    const res = await POST(
      buildRequest("/api/ask/history", {
        method: "POST",
        body: { answer: { question: "show roas" } },
      }),
    );
    const body = await expectJson<{ persisted: boolean; id: unknown }>(
      res,
      200,
    );
    expect(body.persisted).toBe(false);
    expect(body.id).toBeNull();
    expect(recordAskQuery).not.toHaveBeenCalled();
  });
});
