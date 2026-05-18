import { defineConfig, devices } from "@playwright/test";
import path from "node:path";
import dotenv from "dotenv";

// Load .env.local + .env so the auth-setup project can reach
// CLERK_SECRET_KEY / NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY / E2E_CLERK_USER_*
// without the user having to export them by hand. `.env.local` wins
// over `.env` because that's how Next.js layers them and we want the
// Playwright env to match the dev server's view of the world.
dotenv.config({ path: path.join(__dirname, ".env") });
dotenv.config({ path: path.join(__dirname, ".env.local"), override: true });

const PORT = process.env.PORT ?? "3001";
const BASE_URL = process.env.BASE_URL ?? `http://localhost:${PORT}`;

const STORAGE_STATE = path.join(__dirname, "tests", ".auth", "user.json");

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Cap local parallelism so the dev server + BigQuery aren't overwhelmed;
  // CI still serializes to 1 worker. Default (unset) is ~50% of CPU cores,
  // which on a 16-core machine means 8 workers all hitting Turbopack at
  // once and starving the dashboard load past expect timeouts.
  workers: process.env.CI ? 1 : 4,
  reporter: process.env.CI ? "github" : "list",
  // Per-test timeout: the default 30s is too tight for spec.beforeEach + a
  // /dashboard navigation that fans out to BigQuery + Anthropic under
  // parallel load. Bump to 90s globally; the security/anonymous specs
  // finish well under 5s so this only matters for the heavy authed paths.
  timeout: 90_000,
  expect: {
    // Mirror actionTimeout. Default 5s is too tight under parallel BQ
    // fetches; 15s lets a slow but-otherwise-healthy paint converge.
    timeout: 15_000,
  },
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    // Default 5s expect timeout starves under parallel turbopack +
    // BigQuery load. 15s keeps assertions responsive on healthy pages
    // and gives the dashboard a fair window to mount.
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    // Unauthenticated suite — security, CSP, headers, auth-redirect probes.
    // Must NOT depend on or consume any signed-in storageState.
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      // Authenticated specs live alongside the unauthenticated ones; this
      // project ignores them so the security suite stays anonymous.
      testIgnore: [
        "**/auth.setup.ts",
        "**/welcome.spec.ts",
        "**/dashboard.spec.ts",
        "**/dashboard-globalcomix.spec.ts",
        "**/bq-dashboard.spec.ts",
        "**/agents-aria-playground.spec.ts",
        // Product surfaces that sit behind the Clerk gate. The "chromium"
        // project stays anonymous on purpose, so these live in
        // "chromium-authed" instead.
        "**/ask.spec.ts",
        "**/campaigns.spec.ts",
        "**/campaign-profile.spec.ts",
        "**/feed.spec.ts",
        "**/reports.spec.ts",
        "**/knowledge.spec.ts",
        "**/global-filter.spec.ts",
        // New authed lifecycle specs (Step 4 of the test-coverage push).
        "**/pin-lifecycle.spec.ts",
        "**/report-end-to-end.spec.ts",
        "**/notifications.spec.ts",
        "**/agents-memory-persist.spec.ts",
        "**/ai-mode.spec.ts",
        "**/sign-out.spec.ts",
        // Cache-subsystem admin UX.
        "**/sync-now.spec.ts",
        // api-auth-matrix.spec.ts is intentionally NOT ignored — it runs
        // in the anonymous chromium project to prove every /api/bq/*
        // route is gated when there is no session.
      ],
    },

    // Setup project — signs into Clerk via @clerk/testing and writes
    // tests/.auth/user.json. Runs before chromium-authed.
    {
      name: "auth-setup",
      testMatch: /auth\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },

    // Authenticated suite — runs against /welcome, /dashboard, and any
    // future spec that needs a signed-in session.
    {
      name: "chromium-authed",
      use: {
        ...devices["Desktop Chrome"],
        storageState: STORAGE_STATE,
      },
      dependencies: ["auth-setup"],
      testMatch: [
        "**/welcome.spec.ts",
        "**/dashboard.spec.ts",
        "**/dashboard-globalcomix.spec.ts",
        "**/bq-dashboard.spec.ts",
        "**/agents-aria-playground.spec.ts",
        "**/ask.spec.ts",
        "**/campaigns.spec.ts",
        "**/campaign-profile.spec.ts",
        "**/feed.spec.ts",
        "**/reports.spec.ts",
        "**/knowledge.spec.ts",
        "**/global-filter.spec.ts",
        // New authed lifecycle specs (Step 4 of the test-coverage push).
        "**/pin-lifecycle.spec.ts",
        "**/report-end-to-end.spec.ts",
        "**/notifications.spec.ts",
        "**/agents-memory-persist.spec.ts",
        "**/ai-mode.spec.ts",
        "**/sign-out.spec.ts",
        // Cache-subsystem admin UX.
        "**/sync-now.spec.ts",
        // Diagnostic dashboard scans (real Clerk session + real BQ).
        "**/dashboard-scan.spec.ts",
        "**/topbar-scan.spec.ts",
        "**/three-tab-scan.spec.ts",
      ],
    },

    // Preview-mode UI suite — runs the BQ-backed dashboard spec without
    // Clerk. Engaged by setting PLAYWRIGHT_PREVIEW=1 and LUMEN_PREVIEW=1,
    // then targeting --project=chromium-preview. This sidesteps auth-setup
    // entirely so it's safe to use against a dev server that has no test
    // user provisioned. When PLAYWRIGHT_PREVIEW is unset the testMatch is
    // empty, so `npm run test:e2e` without the flag silently no-ops this
    // project rather than tripping over a missing webServer setup.
    {
      name: "chromium-preview",
      use: { ...devices["Desktop Chrome"] },
      testMatch:
        process.env.PLAYWRIGHT_PREVIEW === "1"
          ? [
              "**/bq-dashboard.spec.ts",
              "**/agents-aria-playground.spec.ts",
            ]
          : [],
    },
  ],
  // Local: reuse a running dev server, spin one up if there isn't one.
  // CI: always start a production server against the prebuilt .next/ output.
  // Tests run against the same artifact Vercel ships, not turbopack/dev.
  //
  // PLAYWRIGHT_PREVIEW=1 (CLI env) → spin the dev server with LUMEN_PREVIEW=1
  // so auth is short-circuited and the BQ-backed UI tests can render
  // /dashboard without a Clerk session. Outside CI only.
  webServer: {
    command: process.env.CI
      ? `npm run start -- --port ${PORT}`
      : "npm run dev",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env:
      process.env.PLAYWRIGHT_PREVIEW === "1"
        ? {
            ...(process.env as Record<string, string>),
            LUMEN_PREVIEW: "1",
            PORT,
          }
        : undefined,
  },
});
