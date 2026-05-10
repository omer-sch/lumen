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
      testMatch: ["**/welcome.spec.ts", "**/dashboard.spec.ts"],
    },
  ],
  // Reuse a running dev server; spin one up if there isn't one.
  webServer: {
    command: "npm run dev",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
