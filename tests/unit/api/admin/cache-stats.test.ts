// Layer 3. File under test: src/app/api/admin/cache-stats/route.ts.
// Verifies auth gating and the payload shape from the counter module.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { expectJson } from "../_lib/route-test-utils";

const { authMock, currentUserMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  currentUserMock: vi.fn(),
}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
  currentUser: currentUserMock,
}));

import { recordCacheEvent, resetCacheStatsForTests } from "@/lib/cache/stats";

const ORIGINAL_IDS = process.env.LUMEN_ADMIN_USER_IDS;
const ORIGINAL_EMAILS = process.env.LUMEN_ADMIN_EMAILS;

beforeEach(() => {
  vi.resetModules();
  authMock.mockReset();
  currentUserMock.mockReset();
  resetCacheStatsForTests();
  delete process.env.LUMEN_ADMIN_USER_IDS;
  delete process.env.LUMEN_ADMIN_EMAILS;
});

afterEach(() => {
  if (ORIGINAL_IDS === undefined) delete process.env.LUMEN_ADMIN_USER_IDS;
  else process.env.LUMEN_ADMIN_USER_IDS = ORIGINAL_IDS;
  if (ORIGINAL_EMAILS === undefined) delete process.env.LUMEN_ADMIN_EMAILS;
  else process.env.LUMEN_ADMIN_EMAILS = ORIGINAL_EMAILS;
});

describe("GET /api/admin/cache-stats", () => {
  it("returns 401 when there is no session", async () => {
    authMock.mockResolvedValue({ userId: null });
    const { GET } = await import("@/app/api/admin/cache-stats/route");
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("returns 403 for a non-admin session", async () => {
    authMock.mockResolvedValue({ userId: "user_random" });
    process.env.LUMEN_ADMIN_USER_IDS = "user_admin_1";
    const { GET } = await import("@/app/api/admin/cache-stats/route");
    const res = await GET();
    expect(res.status).toBe(403);
  });

  it("returns the totals and per-query buckets for an admin", async () => {
    authMock.mockResolvedValue({ userId: "user_admin_1" });
    process.env.LUMEN_ADMIN_USER_IDS = "user_admin_1";
    recordCacheEvent("hit", "kpis");
    recordCacheEvent("hit", "kpis");
    recordCacheEvent("miss", "trend");

    const { GET } = await import("@/app/api/admin/cache-stats/route");
    const res = await GET();
    const body = await expectJson<{
      enabled: boolean;
      totals: { hit: number; miss: number; error: number; bypass: number };
      counters: { hit: Record<string, number>; miss: Record<string, number> };
    }>(res, 200);

    expect(body.totals.hit).toBe(2);
    expect(body.totals.miss).toBe(1);
    expect(body.counters.hit).toEqual({ kpis: 2 });
    expect(body.counters.miss).toEqual({ trend: 1 });
    expect(typeof body.enabled).toBe("boolean");
  });
});
