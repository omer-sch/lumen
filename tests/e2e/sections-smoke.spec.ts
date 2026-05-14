import { test, expect, type Route } from "@playwright/test";

// Cross-section UI smoke tests that don't depend on Clerk e2e creds. Runs
// against a dev server with LUMEN_PREVIEW=1 and skips itself otherwise.
//
//   LUMEN_PREVIEW=1 PORT=3001 npx playwright test sections-smoke --project=chromium
//
// Each section gets one or two structural assertions covering the load-bearing
// invariants from CLAUDE.md (the global filter rule, Feed/Knowledge filter
// exclusion, the IA pages exist). The deeper Clerk-authenticated coverage
// lives in the per-section specs (dashboard.spec.ts, etc.) — this file is the
// fast feedback loop that survives a missing Clerk testing token.

// Network guard: nothing in these tests should call out to an external AI
// provider. If a future commit accidentally puts api.anthropic.com into the
// browser path, fail loudly here too.
const blockExternalAi = async (route: Route) => {
  const url = route.request().url();
  if (/api\.anthropic\.com|api\.openai\.com/i.test(url)) {
    throw new Error(`External AI call leaked into the browser: ${url}`);
  }
  await route.continue();
};

test.describe("section smoke (preview-mode)", () => {
  test.beforeAll(async ({ request }) => {
    const probe = await request.get("/api/agents/aria/memory", {
      maxRedirects: 0,
    });
    test.skip(
      probe.status() !== 200,
      "section smoke specs require LUMEN_PREVIEW=1 so app routes are reachable.",
    );
  });

  test.beforeEach(async ({ page }) => {
    await page.route("**/*", blockExternalAi);
  });

  test("/dashboard renders KPI tiles, trend chart, and the global filter bar", async ({
    page,
  }) => {
    await page.goto("/dashboard");
    // Default-client (globalcomix) hero slots — see DEFAULT_SLOTS in
    // DashboardView. Subscription funnel: CPA D7 → spend → installs →
    // Sub D7.
    for (const id of ["cpaD7", "spend", "installs", "subD7"] as const) {
      await expect(page.getByTestId(`kpi-${id}`)).toBeVisible();
    }
    await expect(page.getByTestId("trend-chart")).toBeVisible();
    await expect(page.getByTestId("dashboard-mode-toggle")).toBeVisible();
    // Date presets — five segmented options must render on filtered routes.
    for (const preset of ["7d", "14d", "30d", "90d", "custom"] as const) {
      await expect(page.getByTestId(`date-range-${preset}`)).toBeVisible();
    }
  });

  test("/campaigns renders the breakdown table with one row per campaign", async ({
    page,
  }) => {
    await page.goto("/campaigns");
    const rows = page.locator("tbody tr");
    await expect.poll(async () => rows.count()).toBeGreaterThan(0);
    // Global filter (date range + client) carries onto Campaigns per CLAUDE.md.
    await expect(page.getByTestId("date-range-7d")).toBeVisible();
  });

  test("/queries (Ask) shows the NL input and the global filter", async ({
    page,
  }) => {
    await page.goto("/queries");
    // The textbox is auto-focused, accessible name "Ask Lumen".
    await expect(
      page.getByRole("textbox", { name: /ask lumen/i }),
    ).toBeVisible();
    await expect(page.getByTestId("date-range-7d")).toBeVisible();
  });

  test("/reports shows the prompt textarea and a generate affordance", async ({
    page,
  }) => {
    await page.goto("/reports");
    await expect(page.locator("textarea").first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: /generate/i }).first(),
    ).toBeVisible();
  });

  test("/feed renders insight cards and does NOT show the global filter", async ({
    page,
  }) => {
    await page.goto("/feed");
    // Cards: Feed renders one rounded card per AI insight.
    await expect.poll(async () => page.getByRole("button").count()).toBeGreaterThan(3);
    // Per CLAUDE.md "Cross-cutting: the global filter" — Feed is excluded.
    await expect(page.getByTestId("date-range-7d")).toHaveCount(0);
  });

  test("/knowledge renders learned-context sections and excludes the filter", async ({
    page,
  }) => {
    await page.goto("/knowledge");
    await expect(
      page.getByRole("heading", { name: /what lumen knows/i }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: /connected sources/i }),
    ).toBeVisible();
    // Knowledge isn't time-bound; the global filter must not appear.
    await expect(page.getByTestId("date-range-7d")).toHaveCount(0);
  });

  test("topbar nav links resolve to all six IA pages", async ({ page }) => {
    await page.goto("/dashboard");
    for (const [label, href] of [
      ["Dashboard", "/dashboard"],
      ["Campaigns", "/campaigns"],
      ["Ask", "/queries"],
      ["Reports", "/reports"],
      ["Feed", "/feed"],
      ["Agents", "/agents"],
      ["Knowledge", "/knowledge"],
    ] as const) {
      const link = page.getByRole("link", { name: new RegExp(`^${label}`) }).first();
      await expect(link, `${label} link should exist`).toBeVisible();
      await expect(link).toHaveAttribute("href", href);
    }
  });
});
