// Layer 2 (backend lib unit). File under test: src/lib/db/user.ts. Priority: P0.
// The auth-fail-loud path. If middleware bypasses the gate and a route still
// calls getUserId, this must throw — silently returning a sentinel would
// attribute user actions to nobody.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The global setup mocks @clerk/nextjs/server with auth() returning a fixed
// userId. We re-mock per-test for the negative paths.
beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("db/user.getUserId", () => {
  it("returns the Clerk userId when a session is present", async () => {
    vi.doMock("@clerk/nextjs/server", () => ({
      auth: async () => ({ userId: "user_abc" }),
    }));
    const { getUserId } = await import("@/lib/db/user");
    await expect(getUserId()).resolves.toBe("user_abc");
  });

  it("throws when no session and not in preview", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("LUMEN_PREVIEW", "");
    vi.doMock("@clerk/nextjs/server", () => ({
      auth: async () => ({ userId: null }),
    }));
    const { getUserId } = await import("@/lib/db/user");
    await expect(getUserId()).rejects.toThrow(
      /Clerk session|auth gate/i,
    );
  });

  it("falls back to PREVIEW_USER_ID when LUMEN_PREVIEW=1 and no session", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("LUMEN_PREVIEW", "1");
    vi.doMock("@clerk/nextjs/server", () => ({
      auth: async () => ({ userId: null }),
    }));
    const { getUserId, PREVIEW_USER_ID } = await import("@/lib/db/user");
    await expect(getUserId()).resolves.toBe(PREVIEW_USER_ID);
  });

  it("PREVIEW_USER_ID matches the seed.sql sentinel", async () => {
    const { PREVIEW_USER_ID } = await import("@/lib/db/user");
    expect(PREVIEW_USER_ID).toBe("seed_user_dev");
  });
});
