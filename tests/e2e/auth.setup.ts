// Authenticated-state setup for Playwright. Runs as the "auth-setup"
// project; produces tests/.auth/user.json which the "chromium-authed"
// project loads as storageState. The unauthenticated "chromium" project
// (security suite) does NOT consume this — it stays anonymous on purpose.
//
// ─────────────────────────────────────────────────────────────────────
// TEMPORARY (2026-05-12): the test user provisioned in .env.local
// (E2E_CLERK_USER_EMAIL = lum***@yellowhead.dev) signs in via Google
// OAuth in normal use and has NO Clerk password set. The password
// strategy below therefore fails — auth-setup lands back on /sign-in
// and downstream Clerk-authed specs do not run.
//
// Two fixes (pick one when you get a moment):
//  (a) In the Clerk dashboard, set a password on that user. The existing
//      flow below will then work, no code change needed.
//  (b) Rewrite this setup to use Clerk's sign-in-token / OTP strategy
//      via the @clerk/testing helpers — no Clerk-side change required.
//
// Until then, agent-playground E2E runs against PREVIEW mode
// (chromium-preview project) instead of chromium-authed. See
// tests/e2e/agents-aria-playground.spec.ts.
// ─────────────────────────────────────────────────────────────────────
//
// Required env vars (set in .env.local or your CI secret store):
//   CLERK_SECRET_KEY               — server key for the Clerk testing API
//   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY — required by @clerk/testing
//   E2E_CLERK_USER_EMAIL           — pre-provisioned test user email (the
//                                    Clerk instance is configured to accept
//                                    email-only as the sign-in identifier).
//                                    `E2E_CLERK_USER_USERNAME` is read as a
//                                    legacy fallback so older configs keep
//                                    working.
//   E2E_CLERK_USER_PASSWORD        — that user's password
//
// The Clerk testing token (used by setupClerkTestingToken) is fetched at
// runtime from CLERK_SECRET_KEY — there is no separate CLERK_TESTING_TOKEN
// env var. If you see auth-setup fail with "Missing publishable key", your
// .env.local isn't being loaded by Playwright; either export the vars in
// your shell or wire dotenv into playwright.config.ts.
import { test as setup, expect } from "@playwright/test";
import { clerk, clerkSetup } from "@clerk/testing/playwright";
import path from "node:path";

const AUTH_FILE = path.join(__dirname, "..", ".auth", "user.json");

setup("authenticate as a test user", async ({ page }) => {
  // Provisions the testing token against the Clerk instance referenced by
  // NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY + CLERK_SECRET_KEY. Must run once
  // per setup project before any sign-in attempt.
  await clerkSetup();

  const identifier =
    process.env.E2E_CLERK_USER_EMAIL ?? process.env.E2E_CLERK_USER_USERNAME;
  const password = process.env.E2E_CLERK_USER_PASSWORD;
  if (!identifier || !password) {
    throw new Error(
      "E2E_CLERK_USER_EMAIL (or legacy E2E_CLERK_USER_USERNAME) and " +
        "E2E_CLERK_USER_PASSWORD must be set to run the authenticated " +
        "Playwright project. See the comment at the top of tests/e2e/auth.setup.ts.",
    );
  }

  // /sign-in is the public entry — Clerk's hosted form mounts there.
  // We hit it first so Clerk's client SDK is loaded before clerk.signIn
  // dispatches its programmatic flow.
  await page.goto("/sign-in");
  await clerk.signIn({
    page,
    signInParams: { strategy: "password", identifier, password },
  });

  // Land on /welcome (signed-in root redirects here per src/app/page.tsx).
  // We wait for the post-auth redirect to settle before persisting state.
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard/);

  await page.context().storageState({ path: AUTH_FILE });
});
