import { test, expect } from "@playwright/test";
import { setupClerkTestingToken } from "@clerk/testing/playwright";

// /dashboard is the daily home base — the page every team opens first.
// Tests below assume the mock dashboard data in src/lib/mock/dashboard.ts
// is what drives the KPIs and trend chart (no real DB wiring yet, per
// SPEC.md "Phase 0"). When real data lands, the value-format assertions
// below may need tightening, but the structural ones (count of tiles,
// trend group tabs, mode toggle) stay valid.

test.describe("dashboard (authenticated)", () => {
  test.beforeEach(async ({ page, context }) => {
    await setupClerkTestingToken({ page });
    // Skip the /welcome cinematic by pre-seeding today's cookie. Without
    // this we'd race the auto-advance and intermittently land on /welcome
    // instead of /dashboard.
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

  // KPI strip — four tiles by id (data-testid="kpi-{id}"). The DEFAULT_SLOTS
  // order in DashboardView for the multi-source default client
  // (globalcomix) is [cpaD7, spend, installs, subD7] — the subscription
  // funnel reads. Lose any of them and the daily-glance promise of the
  // page breaks.
  test("renders four KPI tiles with the canonical metrics", async ({ page }) => {
    for (const id of ["cpaD7", "spend", "installs", "subD7"] as const) {
      await expect(page.getByTestId(`kpi-${id}`)).toBeVisible();
    }
  });

  // Count-up numbers — KpiCard wraps the value in <CountUpNumber> which
  // animates from 0 to the final value. By the time the page settles,
  // the rendered text must be a real value, not "0" or empty.
  test("KPI values count up and settle on real numbers", async ({ page }) => {
    const cpa = page.getByTestId("kpi-cpaD7");
    await expect(cpa).toBeVisible();
    // CPA D7 is rendered via formatKpi.cpi → "$X.XX". Match the brand
    // shape rather than a specific number so live data drift doesn't
    // flip this test red.
    await expect(cpa).toContainText(/\$\d+\.\d{2}/);

    const spend = page.getByTestId("kpi-spend");
    await expect(spend).toContainText(/\$\d/);

    const installs = page.getByTestId("kpi-installs");
    await expect(installs).toContainText(/\d/);

    const subD7 = page.getByTestId("kpi-subD7");
    await expect(subD7).toContainText(/\d/);
  });

  // Trend chart + metric switcher — the chart starts on the hero
  // metric (cpaD7 for multi-source clients) and exposes a `data-metric`
  // attribute that updates when a tab is clicked. The switcher is now
  // two-tiered: pick a group first (Volume / Efficiency / Revenue /
  // Money back / Users), then a metric inside it. Group tabs swap which
  // metric tabs are visible, so to reach `spend` from the default
  // `cpaD7` (Efficiency) we go through `trend-group-volume`.
  test("trend chart switches metrics via the grouped tab strip", async ({ page }) => {
    const chart = page.getByTestId("trend-chart");
    await expect(chart).toBeVisible();
    await expect(chart).toHaveAttribute("data-metric", "cpaD7");

    // Jump to the Volume group; its first metric (`spend`) becomes active.
    await page.getByTestId("trend-group-volume").click();
    await expect(chart).toHaveAttribute("data-metric", "spend");

    // Pick a non-default metric inside the same group.
    await page.getByTestId("trend-metric-installs").click();
    await expect(chart).toHaveAttribute("data-metric", "installs");

    // Hop back to Efficiency and re-select the hero metric.
    await page.getByTestId("trend-group-efficiency").click();
    await page.getByTestId("trend-metric-cpaD7").click();
    await expect(chart).toHaveAttribute("data-metric", "cpaD7");
  });

  // Lumen Dashboard mode toggle — the rename from "AI Dashboard" to
  // "Lumen Dashboard" was a deliberate brand move; the label and the
  // toggle behaviour both need to be guarded.
  test("Lumen Dashboard mode toggle is present and switches the view", async ({
    page,
  }) => {
    const toggle = page.getByTestId("dashboard-mode-toggle");
    await expect(toggle).toBeVisible();

    const myTab = page.getByTestId("mode-my");
    const aiTab = page.getByTestId("mode-ai");

    // The AI tab is the renamed "Lumen Dashboard" tab — its label must
    // not regress back to "AI Dashboard".
    await expect(aiTab).toContainText(/Lumen Dashboard/i);
    await expect(aiTab).not.toContainText(/AI Dashboard/i);

    // Default state: My Dashboard selected.
    await expect(myTab).toHaveAttribute("aria-selected", "true");
    await expect(aiTab).toHaveAttribute("aria-selected", "false");

    // Switch into Lumen Dashboard — the My Dashboard KPI strip should
    // disappear (AIModeView replaces the whole MyDashboard subtree).
    await aiTab.click();
    await expect(aiTab).toHaveAttribute("aria-selected", "true");
    await expect(myTab).toHaveAttribute("aria-selected", "false");
    await expect(page.getByTestId("trend-chart")).toHaveCount(0);

    // Flip back — trend chart re-renders.
    await myTab.click();
    await expect(page.getByTestId("trend-chart")).toBeVisible();
  });

  // Global filter bar — DateRangePicker + ClientSelector mount in the
  // TopBar for routes flagged showFilters: true. Both must be present
  // on /dashboard or the filter-state-travels-across-pages contract
  // (CLAUDE.md "Cross-cutting: the global filter") is broken.
  test("global filter bar renders date presets and client selector", async ({
    page,
  }) => {
    // Date presets — segmented control with one button per preset.
    for (const preset of ["7d", "14d", "30d", "90d"] as const) {
      await expect(page.getByTestId(`date-range-${preset}`)).toBeVisible();
    }
    await expect(page.getByTestId("date-range-custom")).toBeVisible();

    // Client selector — opens a listbox of clients.
    await expect(page.getByTestId("client-select")).toBeVisible();

    // Switching presets should update aria-pressed — the visual selected
    // state has to track the URL-backed filter, not just toggle locally.
    await page.getByTestId("date-range-14d").click();
    await expect(page.getByTestId("date-range-14d")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByTestId("date-range-7d")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });
});
