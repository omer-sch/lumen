// Layer 3 (API route-handler). File under test:
// src/app/api/pins/[id]/route.ts. Priority: P1.
// DELETE /api/pins/[id] — removes a single pin by id. Same preview / real-DB
// branching as the parent route.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildRequest, expectJson } from "../_lib/route-test-utils";

const { removePinForUser, getUserId, isSupabaseConfigured } = vi.hoisted(() => ({
  removePinForUser: vi.fn(),
  getUserId: vi.fn(),
  isSupabaseConfigured: vi.fn(),
}));


vi.mock("@/lib/db/pins", () => ({ removePinForUser }));
vi.mock("@/lib/db/user", () => ({ getUserId }));
vi.mock("@/lib/env.server", async () => {
  const actual = await vi.importActual<typeof import("@/lib/env.server")>(
    "@/lib/env.server",
  );
  return { ...actual, isSupabaseConfigured };
});

beforeEach(() => {
  vi.resetModules();
  removePinForUser.mockReset();
  getUserId.mockReset();
  isSupabaseConfigured.mockReset();
  getUserId.mockResolvedValue("user_test");
});

afterEach(() => vi.restoreAllMocks());

describe("DELETE /api/pins/[id]", () => {
  it("returns 200 and calls the DB when Supabase is configured", async () => {
    isSupabaseConfigured.mockReturnValue(true);
    removePinForUser.mockResolvedValue(undefined);
    const { DELETE } = await import("@/app/api/pins/[id]/route");
    const res = await DELETE(buildRequest("/api/pins/p1", { method: "DELETE" }), {
      params: Promise.resolve({ id: "p1" }),
    });
    const body = await expectJson<{ persisted: boolean }>(res, 200);
    expect(body.persisted).toBe(true);
    expect(removePinForUser).toHaveBeenCalledWith("user_test", "p1");
  });

  it("returns 200 + persisted=false when Supabase is not configured", async () => {
    isSupabaseConfigured.mockReturnValue(false);
    const { DELETE } = await import("@/app/api/pins/[id]/route");
    const res = await DELETE(buildRequest("/api/pins/p1", { method: "DELETE" }), {
      params: Promise.resolve({ id: "p1" }),
    });
    const body = await expectJson<{ persisted: boolean }>(res, 200);
    expect(body.persisted).toBe(false);
    expect(removePinForUser).not.toHaveBeenCalled();
  });

  it("returns 400 when the id param is empty", async () => {
    const { DELETE } = await import("@/app/api/pins/[id]/route");
    const res = await DELETE(buildRequest("/api/pins/", { method: "DELETE" }), {
      params: Promise.resolve({ id: "" }),
    });
    const body = await expectJson<{ error: string }>(res, 400);
    expect(body.error).toMatch(/id required/);
  });
});
