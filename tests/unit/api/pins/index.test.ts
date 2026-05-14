// Layer 3 (API route-handler). File under test: src/app/api/pins/route.ts.
// Priority: P1.
// /api/pins is the persistent backing for the dashboard's pinned-tile state.
// Two real paths (Supabase configured) and two preview paths (no Supabase →
// route returns a degenerate response so the UI keeps working without DB).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildRequest, expectJson } from "../_lib/route-test-utils";

const { listPinsForUser, addPinForUser, getUserId, isSupabaseConfigured } = vi.hoisted(() => ({
  listPinsForUser: vi.fn(),
  addPinForUser: vi.fn(),
  getUserId: vi.fn(),
  isSupabaseConfigured: vi.fn(),
}));


vi.mock("@/lib/db/pins", () => ({
  listPinsForUser,
  addPinForUser,
}));
vi.mock("@/lib/db/user", () => ({ getUserId }));
vi.mock("@/lib/env.server", async () => {
  const actual = await vi.importActual<typeof import("@/lib/env.server")>(
    "@/lib/env.server",
  );
  return { ...actual, isSupabaseConfigured };
});

beforeEach(() => {
  vi.resetModules();
  listPinsForUser.mockReset();
  addPinForUser.mockReset();
  getUserId.mockReset();
  isSupabaseConfigured.mockReset();
  getUserId.mockResolvedValue("user_test");
});

afterEach(() => vi.restoreAllMocks());

const PIN_BODY = {
  label: "Spend",
  config: { kind: "kpi", metric: "spend", value: "$285k" },
};

describe("GET /api/pins", () => {
  it("returns 200 with the user's tiles when Supabase is configured", async () => {
    isSupabaseConfigured.mockReturnValue(true);
    listPinsForUser.mockResolvedValue([
      { id: "p1", userId: "user_test", pinnedAt: 1, config: PIN_BODY.config },
    ]);
    const { GET } = await import("@/app/api/pins/route");
    const res = await GET();
    const body = await expectJson<{ tiles: unknown[] }>(res, 200);
    expect(body.tiles).toHaveLength(1);
    expect(getUserId).toHaveBeenCalled();
    expect(listPinsForUser).toHaveBeenCalledWith("user_test");
  });

  it("returns 200 with { tiles: [] } when Supabase is not configured (preview)", async () => {
    isSupabaseConfigured.mockReturnValue(false);
    const { GET } = await import("@/app/api/pins/route");
    const res = await GET();
    const body = await expectJson<{ tiles: unknown[] }>(res, 200);
    expect(body.tiles).toEqual([]);
    expect(getUserId).not.toHaveBeenCalled();
    expect(listPinsForUser).not.toHaveBeenCalled();
  });
});

describe("POST /api/pins", () => {
  it("returns 200 + persisted tile when Supabase is configured and body is valid", async () => {
    isSupabaseConfigured.mockReturnValue(true);
    addPinForUser.mockResolvedValue({
      id: "p1",
      userId: "user_test",
      pinnedAt: 1,
      label: PIN_BODY.label,
      config: PIN_BODY.config,
    });
    const { POST } = await import("@/app/api/pins/route");
    const res = await POST(
      buildRequest("/api/pins", { method: "POST", body: PIN_BODY }),
    );
    const body = await expectJson<{
      ok: boolean;
      persisted: boolean;
      tile: { id: string };
    }>(res, 200);
    expect(body.persisted).toBe(true);
    expect(body.tile.id).toBe("p1");
  });

  it("returns { persisted: false, tile: null } when Supabase is not configured", async () => {
    isSupabaseConfigured.mockReturnValue(false);
    const { POST } = await import("@/app/api/pins/route");
    const res = await POST(
      buildRequest("/api/pins", { method: "POST", body: PIN_BODY }),
    );
    const body = await expectJson<{ persisted: boolean; tile: unknown }>(
      res,
      200,
    );
    expect(body.persisted).toBe(false);
    expect(body.tile).toBeNull();
    expect(addPinForUser).not.toHaveBeenCalled();
  });

  it("returns 400 when the body is missing `config`", async () => {
    isSupabaseConfigured.mockReturnValue(true);
    const { POST } = await import("@/app/api/pins/route");
    const res = await POST(
      buildRequest("/api/pins", { method: "POST", body: { label: "x" } }),
    );
    const body = await expectJson<{ error: string }>(res, 400);
    expect(body.error).toMatch(/config required/);
    expect(addPinForUser).not.toHaveBeenCalled();
  });
});
