import { test, expect } from "@playwright/test";
import { clerk, setupClerkTestingToken } from "@clerk/testing/playwright";

/**
 * Sign-out lifecycle: a signed-in user can sign out, and after that
 * /dashboard access redirects to /sign-in. The original storageState
 * (tests/.auth/user.json) is provisioned by auth.setup.ts; this test
 * lives in chromium-authed and consumes it, then invalidates the
 * session via `clerk.signOut()`.
 */
test.describe("sign-out", () => {
  test("clerk.signOut() ends the session and re-protects /dashboard", async ({
    page,
  }) => {
    await setupClerkTestingToken({ page });

    // Confirm we start signed-in by visiting /dashboard.
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard/);

    // Sign out via Clerk's testing API. After this, the session token
    // baked into storageState should no longer authenticate the user.
    await clerk.signOut({ page });

    // Visit /dashboard again — Clerk middleware should bounce us to
    // /sign-in. We don't assert the exact URL form because Clerk's
    // hosted sign-in may rewrite the path; we DO assert that we are
    // no longer on /dashboard.
    await page.goto("/dashboard");
    await page.waitForURL((url) => !url.pathname.startsWith("/dashboard"), {
      timeout: 10_000,
    });
    expect(page.url()).not.toMatch(/\/dashboard(?:\?|$)/);
    // Sign-in routes (/sign-in, /sign-in/sso-callback, …) are public
    // per src/middleware.ts. Confirm we land on one.
    expect(page.url()).toMatch(/\/sign-in/);
  });
});
