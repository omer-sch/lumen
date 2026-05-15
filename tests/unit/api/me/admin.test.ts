// Layer 3. File under test: src/app/api/me/admin/route.ts.
// Probe used by the SyncNowButton to decide whether to render.
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

const ORIGINAL_IDS = process.env.LUMEN_ADMIN_USER_IDS;
const ORIGINAL_EMAILS = process.env.LUMEN_ADMIN_EMAILS;

beforeEach(() => {
  vi.resetModules();
  authMock.mockReset();
  currentUserMock.mockReset();
  delete process.env.LUMEN_ADMIN_USER_IDS;
  delete process.env.LUMEN_ADMIN_EMAILS;
});

afterEach(() => {
  if (ORIGINAL_IDS === undefined) delete process.env.LUMEN_ADMIN_USER_IDS;
  else process.env.LUMEN_ADMIN_USER_IDS = ORIGINAL_IDS;
  if (ORIGINAL_EMAILS === undefined) delete process.env.LUMEN_ADMIN_EMAILS;
  else process.env.LUMEN_ADMIN_EMAILS = ORIGINAL_EMAILS;
});

describe("GET /api/me/admin", () => {
  it("returns isAdmin: false when no session", async () => {
    authMock.mockResolvedValue({ userId: null });
    const { GET } = await import("@/app/api/me/admin/route");
    const res = await GET();
    const body = await expectJson<{ isAdmin: boolean }>(res, 200);
    expect(body).toEqual({ isAdmin: false });
  });

  it("returns isAdmin: false for a non-admin user", async () => {
    authMock.mockResolvedValue({ userId: "user_random" });
    process.env.LUMEN_ADMIN_USER_IDS = "user_admin_1";
    const { GET } = await import("@/app/api/me/admin/route");
    const res = await GET();
    const body = await expectJson<{ isAdmin: boolean }>(res, 200);
    expect(body).toEqual({ isAdmin: false });
  });

  it("returns isAdmin: true for an allowlisted user", async () => {
    authMock.mockResolvedValue({ userId: "user_admin_1" });
    process.env.LUMEN_ADMIN_USER_IDS = "user_admin_1";
    const { GET } = await import("@/app/api/me/admin/route");
    const res = await GET();
    const body = await expectJson<{ isAdmin: boolean }>(res, 200);
    expect(body).toEqual({ isAdmin: true });
  });
});
