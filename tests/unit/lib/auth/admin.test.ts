// Layer 2 (lib-unit). File under test: src/lib/auth/admin.ts.
//
// `getAdminUserId` reads the allowlist from env on every call. Tests
// cover: no session, empty allowlist, user not on list, user on list.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { authMock, currentUserMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  currentUserMock: vi.fn(),
}));
vi.mock("@clerk/nextjs/server", () => ({
  auth: authMock,
  currentUser: currentUserMock,
}));

import { getAdminUserId, isAdminUser } from "@/lib/auth/admin";

const ORIGINAL_IDS = process.env.LUMEN_ADMIN_USER_IDS;
const ORIGINAL_EMAILS = process.env.LUMEN_ADMIN_EMAILS;

beforeEach(() => {
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

describe("getAdminUserId", () => {
  it("returns null when there is no Clerk session", async () => {
    authMock.mockResolvedValue({ userId: null });
    process.env.LUMEN_ADMIN_USER_IDS = "user_admin_1";
    expect(await getAdminUserId()).toBeNull();
  });

  it("returns null when the allowlist is unset (fail closed)", async () => {
    authMock.mockResolvedValue({ userId: "user_admin_1" });
    expect(await getAdminUserId()).toBeNull();
  });

  it("returns null for a user not on the allowlist", async () => {
    authMock.mockResolvedValue({ userId: "user_random" });
    process.env.LUMEN_ADMIN_USER_IDS = "user_admin_1,user_admin_2";
    expect(await getAdminUserId()).toBeNull();
  });

  it("returns the user id when on the allowlist", async () => {
    authMock.mockResolvedValue({ userId: "user_admin_1" });
    process.env.LUMEN_ADMIN_USER_IDS = "user_admin_1, user_admin_2";
    expect(await getAdminUserId()).toBe("user_admin_1");
  });

  it("isAdminUser is a boolean convenience", async () => {
    authMock.mockResolvedValue({ userId: "user_admin_1" });
    process.env.LUMEN_ADMIN_USER_IDS = "user_admin_1";
    expect(await isAdminUser()).toBe(true);
  });

  it("matches via LUMEN_ADMIN_EMAILS using primary email", async () => {
    authMock.mockResolvedValue({ userId: "user_random" });
    process.env.LUMEN_ADMIN_EMAILS = "omer@example.com, gal@example.com";
    currentUserMock.mockResolvedValue({
      primaryEmailAddress: { emailAddress: "omer@example.com" },
      emailAddresses: [{ emailAddress: "omer@example.com" }],
    });
    expect(await getAdminUserId()).toBe("user_random");
  });

  it("email matching is case-insensitive", async () => {
    authMock.mockResolvedValue({ userId: "user_random" });
    process.env.LUMEN_ADMIN_EMAILS = "Omer@Example.com";
    currentUserMock.mockResolvedValue({
      primaryEmailAddress: { emailAddress: "OMER@example.COM" },
    });
    expect(await getAdminUserId()).toBe("user_random");
  });

  it("falls back to the first email when primary is unset", async () => {
    authMock.mockResolvedValue({ userId: "user_random" });
    process.env.LUMEN_ADMIN_EMAILS = "omer@example.com";
    currentUserMock.mockResolvedValue({
      primaryEmailAddress: null,
      emailAddresses: [{ emailAddress: "omer@example.com" }],
    });
    expect(await getAdminUserId()).toBe("user_random");
  });

  it("returns null when the email does not match the allowlist", async () => {
    authMock.mockResolvedValue({ userId: "user_random" });
    process.env.LUMEN_ADMIN_EMAILS = "gal@example.com";
    currentUserMock.mockResolvedValue({
      primaryEmailAddress: { emailAddress: "omer@example.com" },
    });
    expect(await getAdminUserId()).toBeNull();
  });

  it("does not call currentUser when only the user-id allowlist is configured", async () => {
    authMock.mockResolvedValue({ userId: "user_admin_1" });
    process.env.LUMEN_ADMIN_USER_IDS = "user_admin_1";
    expect(await getAdminUserId()).toBe("user_admin_1");
    expect(currentUserMock).not.toHaveBeenCalled();
  });
});
