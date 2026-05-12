import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const PORT = process.env.PORT ?? "3001";
const BASE_URL = process.env.BASE_URL ?? `http://localhost:${PORT}`;

const STORAGE_STATE = path.join(__dirname, "tests", ".auth", "user.json");

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
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
        "**/bq-dashboard.spec.ts",
        "**/agents-aria-playground.spec.ts",
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
        "**/bq-dashboard.spec.ts",
        "**/agents-aria-playground.spec.ts",
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
