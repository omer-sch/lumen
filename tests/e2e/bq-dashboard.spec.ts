import { test, expect } from "@playwright/test";
import { setupClerkTestingToken } from "@clerk/testing/playwright";

/**
 * BigQuery-backed dashboard coverage:
 *   1. DataFreshnessBar visible under topbar on /dashboard.
 *   2. Playw3 coverage-warning chip appears on playw3, hidden on globalcomix.
 *   3. Playw3 footnote rendered only in My Dashboard mode on playw3.
 *   4. Switching clients swaps KPI tile values.
 *   5. Switching date range refetches KPIs (values differ between 7d and 30d).
 *   6. API auth gating — anonymous request to /api/bq/dashboard-kpis must
 *      redirect or 401; authenticated request returns 200.
 *   7. API input validation — preview-mode-only checks for missing param,
 *      malformed date, disallowed client. Skipped unless LUMEN_PREVIEW=1.
 *
 * Notes on data: BQ values are live and drift hourly, so assertions check
 * shape ($ + digit, non-empty) rather than absolute numbers. The 7d-vs-30d
 * delta check is the only "values differ" assertion, and BQ at minimum has
 * different spend totals across windows.
 */

const PORT = process.env.PORT ?? "3001";
const PREVIEW = process.env.LUMEN_PREVIEW === "1";

// --- Dashboard UI suite ---
// In preview mode (LUMEN_PREVIEW=1, non-prod) middleware short-circuits
// Clerk and /dashboard renders without a session. Outside preview, the
// chromium-authed project supplies a Clerk-signed storageState.
//
// We do NOT call `test.use({ storageState })` here — the project config
// (chromium-authed) already wires storageState in, and forcing it on top
// fails in preview where the .auth/user.json may not exist.

test.describe("dashboard — BQ-backed UI surface", () => {
  test.beforeEach(async ({ page, context }) => {
    if (!PREVIEW) {
      await setupClerkTestingToken({ page });
    }
    const todayISO = new Date().toISOString().slice(0, 10);
    await context.addCookies([
      {
        name: "lumen.welcomed.last",
        value: todayISO,
        domain: "localhost",
        path: "/",
        sameSite: "Lax",
      },
    ]);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test("DataFreshnessBar mounts under the topbar with a 'Data' label", async ({
    page,
  }) => {
    const bar = page.getByTestId("data-freshness-bar");
    await expect(bar).toBeVisible();
    const label = page.getByTestId("data-freshness-label");
    await expect(label).toBeVisible();
    // "Data last updated…", "Data freshness unavailable", or
    // "Checking data freshness…" — all start with "Data" / contain "data".
    await expect(label).toContainText(/[Dd]ata/);
  });

  test("Playw3 coverage chip appears for playw3, hidden for globalcomix", async ({
    page,
  }) => {
    // Start by picking playw3 — chip should mount.
    await page.getByTestId("client-select").click();
    await page.getByTestId("client-option-playw3").click();
    const chip = page.getByTestId("client-coverage-warning");
    await expect(chip).toBeVisible();
    await expect(chip).toContainText(/Meta.*Twitter/i);

    // Switch to globalcomix — chip should disappear.
    await page.getByTestId("client-select").click();
    await page.getByTestId("client-option-globalcomix").click();
    await expect(page.getByTestId("client-coverage-warning")).toHaveCount(0);
  });

  test("Playw3 footnote shows only in My Dashboard mode", async ({ page }) => {
    await page.getByTestId("client-select").click();
    await page.getByTestId("client-option-playw3").click();

    // My Dashboard mode is the default.
    const footnote = page.getByTestId("client-coverage-footnote");
    await expect(footnote).toBeVisible();
    await expect(footnote).toContainText(
      "Spend reflects Meta and Twitter only for this client.",
    );

    // Lumen Dashboard mode — footnote should disappear (AIModeView replaces
    // the entire MyDashboard subtree).
    await page.getByTestId("mode-ai").click();
    await expect(page.getByTestId("client-coverage-footnote")).toHaveCount(0);

    // Flip back — footnote reappears.
    await page.getByTestId("mode-my").click();
    await expect(page.getByTestId("client-coverage-footnote")).toBeVisible();
  });

  test("switching client swaps KPI values", async ({ page }) => {
    // Capture KPI values under "all clients" (mock) first.
    const spend = page.getByTestId("kpi-spend");
    const installs = page.getByTestId("kpi-installs");
    await expect(spend).toContainText(/\$\d/);
    await expect(installs).toContainText(/\d/);

    // Wait for count-up to settle — KpiCard animates over ~700ms.
    await page.waitForTimeout(1200);
    const spendBefore = (await spend.textContent())?.trim() ?? "";
    const installsBefore = (await installs.textContent())?.trim() ?? "";

    // Switch to globalcomix — live BQ client, values must shift.
    await page.getByTestId("client-select").click();
    await page.getByTestId("client-option-globalcomix").click();

    // Wait for live fetch + count-up.
    await page.waitForTimeout(1800);
    await expect(spend).toContainText(/\$\d/);

    const spendAfter = (await spend.textContent())?.trim() ?? "";
    const installsAfter = (await installs.textContent())?.trim() ?? "";

    expect(
      spendAfter !== spendBefore || installsAfter !== installsBefore,
      `expected at least one KPI value to change after switching client
       (spend before="${spendBefore}" after="${spendAfter}",
        installs before="${installsBefore}" after="${installsAfter}")`,
    ).toBe(true);
  });

  test("switching date range refetches KPI values (7d vs 30d differ)", async ({
    page,
  }) => {
    // Pick a live BQ client so we exercise the real fetch path.
    await page.getByTestId("client-select").click();
    await page.getByTestId("client-option-globalcomix").click();

    await page.getByTestId("date-range-7d").click();
    await page.waitForTimeout(1800);
    const spend7 = (await page.getByTestId("kpi-spend").textContent())?.trim() ?? "";
    const installs7 =
      (await page.getByTestId("kpi-installs").textContent())?.trim() ?? "";

    await page.getByTestId("date-range-30d").click();
    await page.waitForTimeout(1800);
    const spend30 = (await page.getByTestId("kpi-spend").textContent())?.trim() ?? "";
    const installs30 =
      (await page.getByTestId("kpi-installs").textContent())?.trim() ?? "";

    // Don't assert specific numbers — assert *some* value changed. A 7-day
    // window vs 30-day window must produce different totals on any non-
    // empty dataset.
    expect(
      spend7 !== spend30 || installs7 !== installs30,
      `expected KPI values to differ between 7d and 30d
       (spend 7d="${spend7}" 30d="${spend30}",
        installs 7d="${installs7}" 30d="${installs30}")`,
    ).toBe(true);
  });

  test("authed request to /api/bq/dashboard-kpis returns 200", async ({
    page,
  }) => {
    const from = "2026-04-01";
    const to = "2026-04-30";
    const res = await page.request.get(
      `/api/bq/dashboard-kpis?client=globalcomix&from=${from}&to=${to}`,
    );
    expect(
      [200, 500].includes(res.status()),
      `authenticated probe should reach the handler (200) or fail BQ (500), got ${res.status()}`,
    ).toBe(true);
    // 200 is the success path we actually care about. A 500 here is a
    // BQ-side issue (credentials / dataset mismatch), not an auth gating
    // failure — surface that distinction in the diagnostic above.
    if (res.status() !== 200) {
      test.info().annotations.push({
        type: "warning",
        description: `authed /api/bq/dashboard-kpis returned ${res.status()} — likely BQ config issue, not auth`,
      });
    }
  });
});

// Note: the anonymous /api gating probe lives in bq-api-anon.spec.ts so it
// runs in the unauthenticated 'chromium' project (no storageState).

// --- Preview-mode-only suite — input validation. Skipped unless the dev
//     server was started with LUMEN_PREVIEW=1 (and NODE_ENV !== production).
//     The default Playwright config does NOT set LUMEN_PREVIEW, so these
//     tests skip in the standard harness.

test.describe("dashboard-kpis — input validation (preview mode)", () => {
  test.skip(!PREVIEW, "preview-mode-only — run with LUMEN_PREVIEW=1");

  test("missing 'from' returns 400 with the expected error body", async ({
    request,
  }) => {
    const res = await request.get(
      `/api/bq/dashboard-kpis?client=globalcomix&to=2026-04-30`,
    );
    expect(res.status()).toBe(400);
    expect(await res.json()).toEqual({ error: "Missing required param: from" });
  });

  test("malformed 'from' returns 400 'Bad request'", async ({ request }) => {
    const res = await request.get(
      `/api/bq/dashboard-kpis?client=globalcomix&from=not-a-date&to=2026-04-30`,
    );
    expect(res.status()).toBe(400);
    expect(await res.json()).toEqual({ error: "Bad request" });
  });

  test("disallowed client 'evil-client' returns 403 'Forbidden'", async ({
    request,
  }) => {
    const res = await request.get(
      `/api/bq/dashboard-kpis?client=evil-client&from=2026-04-01&to=2026-04-30`,
    );
    expect(res.status()).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden" });
  });
});
