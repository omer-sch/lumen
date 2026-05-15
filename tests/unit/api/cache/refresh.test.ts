// Layer 3 (API route-handler). File under test: src/app/api/cache/refresh/route.ts.
//
// Auth model is tighter than the bq/* routes — Clerk session AND
// admin allowlist are both required. Tests cover:
//   1. No session            → 401
//   2. Signed in but not admin → 403
//   3. Admin happy path        → 200, invalidate + warm both called
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildRequest, expectJson } from "../_lib/route-test-utils";

const authMock = vi.hoisted(() => vi.fn());
const currentUserMock = vi.hoisted(() => vi.fn());
const invalidateClientCache = vi.hoisted(() => vi.fn());
const warmClientCache = vi.hoisted(() => vi.fn());
const queryGlobalComixDataAsOf = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
  currentUser: currentUserMock,
}));

vi.mock("@/lib/cache/invalidate", () => ({ invalidateClientCache }));
vi.mock("@/lib/cache/warm", () => ({ warmClientCache }));
vi.mock("@/lib/globalcomix-queries", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/globalcomix-queries")
  >("@/lib/globalcomix-queries");
  return { ...actual, queryGlobalComixDataAsOf };
});

beforeEach(() => {
  vi.resetModules();
  authMock.mockReset();
  currentUserMock.mockReset();
  invalidateClientCache.mockReset();
  warmClientCache.mockReset();
  queryGlobalComixDataAsOf.mockReset();
  // Default: no admins in the allowlist.
  delete process.env.LUMEN_ADMIN_USER_IDS;
  delete process.env.LUMEN_ADMIN_EMAILS;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/cache/refresh", () => {
  it("returns 401 when there is no Clerk session", async () => {
    authMock.mockResolvedValue({ userId: null });
    const { POST } = await import("@/app/api/cache/refresh/route");
    const res = await POST(
      buildRequest("/api/cache/refresh?client=globalcomix", { method: "POST" }),
    );
    expect(res.status).toBe(401);
    expect(invalidateClientCache).not.toHaveBeenCalled();
    expect(warmClientCache).not.toHaveBeenCalled();
  });

  it("returns 403 when the signed-in user is not on the admin allowlist", async () => {
    authMock.mockResolvedValue({ userId: "user_random" });
    process.env.LUMEN_ADMIN_USER_IDS = "user_admin_1,user_admin_2";
    const { POST } = await import("@/app/api/cache/refresh/route");
    const res = await POST(
      buildRequest("/api/cache/refresh?client=globalcomix", { method: "POST" }),
    );
    expect(res.status).toBe(403);
    expect(invalidateClientCache).not.toHaveBeenCalled();
    expect(warmClientCache).not.toHaveBeenCalled();
  });

  it("invalidates then re-warms on the happy path", async () => {
    authMock.mockResolvedValue({ userId: "user_admin_1" });
    process.env.LUMEN_ADMIN_USER_IDS = "user_admin_1";
    invalidateClientCache.mockResolvedValue(7);
    warmClientCache.mockResolvedValue([
      { query: "kpis", ok: true, latencyMs: 120 },
      { query: "trend", ok: true, latencyMs: 200 },
    ]);
    queryGlobalComixDataAsOf.mockResolvedValue("2026-05-15");

    const { POST } = await import("@/app/api/cache/refresh/route");
    const res = await POST(
      buildRequest("/api/cache/refresh?client=globalcomix", { method: "POST" }),
    );

    const body = await expectJson<{
      client: string;
      invalidatedKeys: number;
      warmedQueries: number;
      dataAsOf: string | null;
    }>(res, 200);

    expect(body.client).toBe("globalcomix");
    expect(body.invalidatedKeys).toBe(7);
    expect(body.warmedQueries).toBe(2);
    expect(body.dataAsOf).toBe("2026-05-15");
    expect(invalidateClientCache).toHaveBeenCalledWith("globalcomix");
    expect(warmClientCache).toHaveBeenCalledWith("globalcomix");
  });

  it("defaults the client param to globalcomix when omitted", async () => {
    authMock.mockResolvedValue({ userId: "user_admin_1" });
    process.env.LUMEN_ADMIN_USER_IDS = "user_admin_1";
    invalidateClientCache.mockResolvedValue(0);
    warmClientCache.mockResolvedValue([]);
    queryGlobalComixDataAsOf.mockResolvedValue(null);

    const { POST } = await import("@/app/api/cache/refresh/route");
    const res = await POST(buildRequest("/api/cache/refresh", { method: "POST" }));
    const body = await expectJson<{ client: string }>(res, 200);
    expect(body.client).toBe("globalcomix");
    expect(invalidateClientCache).toHaveBeenCalledWith("globalcomix");
  });
});
