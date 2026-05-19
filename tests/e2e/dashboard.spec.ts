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
  // the rendered text must be a real currency / count, not "0" or empty.
  test("KPI values count up and settle on real numbers", async ({ page }) => {
    const cpa = page.getByTestId("kpi-cpaD7");
    await expect(cpa).toBeVisible();
    // CPA D7 routes through formatKpi.cpi → one of the brand currency
    // bands. Match shape, not a specific number.
    await expect(cpa).toContainText(/\$[\d,.]+[kM]?/);

    const spend = page.getByTestId("kpi-spend");
    await expect(spend).toContainText(/\$\d/);

    const installs = page.getByTestId("kpi-installs");
    await expect(installs).toContainText(/\d/);

    const subD7 = page.getByTestId("kpi-subD7");
    await expect(subD7).toContainText(/\d/);
  });

  // Trend chart + metric switcher — the chart starts on `spend` (Volume),
  // the daily-glance default, and exposes a `data-metric` attribute that
  // updates when a tab is clicked. The switcher is two-tiered: pick a
  // group first (Volume / Efficiency / Revenue / Money back / Users),
  // then a metric inside it. Group tabs swap which metric tabs are
  // visible, so to reach `cpaD7` from the default we go through
  // `trend-group-efficiency`.
  test("trend chart switches metrics via the grouped tab strip", async ({ page }) => {
    const chart = page.getByTestId("trend-chart");
    await expect(chart).toBeVisible();
    await expect(chart).toHaveAttribute("data-metric", "spend");

    // Same group — pick a different volume metric.
    await page.getByTestId("trend-metric-installs").click();
    await expect(chart).toHaveAttribute("data-metric", "installs");

    // Jump to Efficiency and pick the hero cohort metric.
    await page.getByTestId("trend-group-efficiency").click();
    await page.getByTestId("trend-metric-cpaD7").click();
    await expect(chart).toHaveAttribute("data-metric", "cpaD7");

    // Hop back to Volume — first metric (`spend`) becomes active on click.
    await page.getByTestId("trend-group-volume").click();
    await expect(chart).toHaveAttribute("data-metric", "spend");
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

  // Lifecycle tab — section decomposition replaces the legacy stuffed
  // SubscriberLifecycle card. Each of the four sections must mount on
  // its own GlassCard so the page reads as a vertical narrative.
  test("lifecycle tab renders the four decomposed sections", async ({
    page,
  }) => {
    await page.goto("/dashboard?tab=lifecycle");
    await expect(page.getByTestId("lifecycle-tab")).toBeVisible();
    for (const id of [
      "lifecycle-kpi-strip",
      "lifecycle-net-sub-trend",
      "lifecycle-os-mix",
      "lifecycle-daily-table",
    ]) {
      await expect(page.getByTestId(id)).toBeVisible();
    }
  });

  // Attribution tab — hero BCAC + PaidVsOrganic split + DataFreshness
  // (compact card) + Coverage warnings row. All four sections must
  // mount so the trust narrative reads top-to-bottom as designed.
  test("attribution tab renders the four sections", async ({ page }) => {
    await page.goto("/dashboard?tab=attribution");
    await expect(page.getByTestId("attribution-tab")).toBeVisible();
    for (const id of [
      "attribution-bcac-hero",
      "attribution-paid-vs-organic",
      "attribution-data-freshness",
      "attribution-coverage-warnings",
    ]) {
      await expect(page.getByTestId(id)).toBeVisible();
    }
    // The freshness card on this tab is the compact variant, not the
    // page-shell badge (which keeps the older data-freshness-bar id).
    await expect(page.getByTestId("attribution-data-freshness")).toHaveAttribute(
      "data-variant",
      "compact",
    );
  });
});
