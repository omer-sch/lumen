import { test, expect } from "@playwright/test";
import { setupClerkTestingToken } from "@clerk/testing/playwright";

/**
 * GlobalComix dashboard, Phase 1 subscription-vocabulary surface:
 *   - Hero tile is CPA D7 (yellow glow), value reads "$X.XX".
 *   - Trend chart defaults to `cpaD7` and renders one Line per ad
 *     network — Google, Meta, TikTok, Apple Search Ads.
 *   - Cohort tabs carry the "tail" indicator pill.
 *   - Network table mounts with the deck-aligned columns, exposes a
 *     "Show more columns" toggle, and rows are clickable.
 */

test.describe("dashboard / GlobalComix subscription view", () => {
  test.beforeEach(async ({ page, context }) => {
    await setupClerkTestingToken({ page });
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
    // Make sure we're on GlobalComix (the default client). The Phase 1
    // dashboard only carries the subscription vocab for multi-source.
    await expect(page.getByTestId("kpi-cpaD7")).toBeVisible();
  });

  test("hero KPI tile reads 'Cost per subscriber at 1 week'", async ({ page }) => {
    const hero = page.getByTestId("kpi-cpaD7");
    await expect(hero).toBeVisible();
    await expect(hero).toContainText(/Cost per subscriber at 1 week/i);
    // Value is rendered via formatKpi.cpi → "$X.XX" (no `x` suffix).
    await expect(hero).toContainText(/\$\d+\.\d{2}/);
    await expect(hero).not.toContainText(/x$/);
  });

  test("trend chart defaults to CPA D7 and tab groups are visible", async ({
    page,
  }) => {
    const chart = page.getByTestId("trend-chart");
    await expect(chart).toBeVisible();
    await expect(chart).toHaveAttribute("data-metric", "cpaD7");

    // Five groups in the tab strip: Volume / Efficiency / Revenue / Money back / Users.
    await expect(page.getByTestId("trend-group-volume")).toBeVisible();
    await expect(page.getByTestId("trend-group-efficiency")).toBeVisible();
    await expect(page.getByTestId("trend-group-revenue")).toBeVisible();
    await expect(page.getByTestId("trend-group-money-back")).toBeVisible();
    await expect(page.getByTestId("trend-group-users")).toBeVisible();
  });

  test("switching tabs across groups keeps the chart mounted", async ({
    page,
  }) => {
    const chart = page.getByTestId("trend-chart");

    await page.getByTestId("trend-metric-spend").click();
    await expect(chart).toHaveAttribute("data-metric", "spend");

    await page.getByTestId("trend-metric-cpaD7").click();
    await expect(chart).toHaveAttribute("data-metric", "cpaD7");

    await page.getByTestId("trend-metric-roas").click();
    await expect(chart).toHaveAttribute("data-metric", "roas");
  });

  test("cohort tabs show the maturity note when active", async ({ page }) => {
    // CPA D7 is the default — maturity note should be on screen on
    // first render.
    await expect(page.getByTestId("trend-maturity-note")).toBeVisible();

    // Spend has no cohort tail — note should disappear.
    await page.getByTestId("trend-metric-spend").click();
    await expect(page.getByTestId("trend-maturity-note")).toHaveCount(0);
  });

  test("network list mounts with key metrics + more toggle + clickable rows", async ({
    page,
  }) => {
    const list = page.getByTestId("network-breakdown");
    await expect(list).toBeVisible();

    // Each row's compact header shows the hero metric (CPA D7) and key counts.
    await expect(list).toContainText(/CPA D7/i);
    await expect(list).toContainText(/Spend/i);
    await expect(list).toContainText(/Installs/i);

    // "More" toggle reveals the secondary KPIs inside each row.
    const toggle = page.getByTestId("network-show-more");
    await expect(toggle).toBeVisible();
    await expect(list).not.toContainText(/CTR/);
    await toggle.click();
    await expect(list).toContainText(/CTR/);

    // Rows are clickable — first row navigates to /campaigns with the
    // network query param. We don't assert the network name (it
    // depends on which network ranked top on this load); we only check
    // the URL shape.
    const firstRow = list
      .locator('[data-testid^="network-row-"]')
      .first();
    await firstRow.click();
    await expect(page).toHaveURL(/\/campaigns\?network=/);
  });
});
