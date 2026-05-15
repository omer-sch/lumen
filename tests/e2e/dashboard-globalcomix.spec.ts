import { test, expect } from "@playwright/test";
import { setupClerkTestingToken } from "@clerk/testing/playwright";

/**
 * GlobalComix dashboard, Phase 1 subscription-vocabulary surface:
 *   - Hero tile is CPA D7 (yellow glow); cost values follow the brand
 *     currency bands so big CPAs read as "$14.9k" not "$14,928.79".
 *   - Trend chart defaults to `spend` (Volume) and renders one Line per
 *     ad network — Google, Meta, TikTok, Apple Search Ads. Title
 *     templates on the active metric ("{label} over time, by ad network.").
 *   - Cohort tabs carry an (i) info icon; a muted italic note appears
 *     below the chart for cohort metrics.
 *   - Network panel mounts with the compact card stack, exposes a
 *     "More" toggle, and rows are clickable.
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
    // Value is rendered via formatKpi.cpi → one of the brand currency
    // bands ($X.XX, $XXX, $X,XXX, $X.Xk, $X.XXM). Not the ratio shape.
    await expect(hero).toContainText(/\$[\d,.]+[kM]?/);
    await expect(hero).not.toContainText(/\dx\b/);
  });

  test("trend chart defaults to Spend (Volume) and tab groups are visible", async ({
    page,
  }) => {
    const chart = page.getByTestId("trend-chart");
    await expect(chart).toBeVisible();
    await expect(chart).toHaveAttribute("data-metric", "spend");

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
    // Default starts on `spend` (Volume).
    await expect(chart).toHaveAttribute("data-metric", "spend");

    // Efficiency group: pick the hero cohort metric.
    await page.getByTestId("trend-group-efficiency").click();
    await page.getByTestId("trend-metric-cpaD7").click();
    await expect(chart).toHaveAttribute("data-metric", "cpaD7");

    // Money back group: first metric (`roas`) becomes active on group click.
    await page.getByTestId("trend-group-money-back").click();
    await expect(chart).toHaveAttribute("data-metric", "roas");
  });

  test("cohort tabs show the maturity note when active", async ({ page }) => {
    // Default is `spend` (no cohort tail) — italic below-chart note
    // should be absent on first render.
    await expect(page.getByTestId("trend-maturity-note")).toHaveCount(0);

    // Switch into Efficiency and pick CPA D7 (a 7-day cohort) — the
    // italic note appears, naming the window length in days.
    await page.getByTestId("trend-group-efficiency").click();
    await page.getByTestId("trend-metric-cpaD7").click();
    const note = page.getByTestId("trend-maturity-note");
    await expect(note).toBeVisible();
    await expect(note).toContainText(/last 7 days are still maturing/i);
  });

  test("chart title templates on the active metric", async ({ page }) => {
    const title = page.getByTestId("trend-chart-title");
    // Default state — Spend.
    await expect(title).toContainText(/spend over time, by ad network/i);

    // Switch to a different group/metric — title follows.
    await page.getByTestId("trend-group-efficiency").click();
    await page.getByTestId("trend-metric-cpaD7").click();
    await expect(title).toContainText(
      /cost per subscriber at 1 week over time, by ad network/i,
    );
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
