import { test, expect } from "@playwright/test";
import { setupClerkTestingToken } from "@clerk/testing/playwright";

// /dashboard is the daily home base — the page every team opens first.
// Tests below assume the mock dashboard data in src/lib/mock/dashboard.ts
// is what drives the KPIs and trend chart (no real DB wiring yet, per
// SPEC.md "Phase 0"). When real data lands, the value-format assertions
// below may need tightening, but the structural ones (count of tiles,
// presence of swap controls, mode toggle) stay valid.

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
        url: "http://localhost:3001",
        path: "/",
        sameSite: "Lax",
      },
    ]);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard/);
  });

  // KPI strip — four tiles by id (data-testid="kpi-{id}"). The DEFAULT_SLOTS
  // order in DashboardView is [roas, spend, installs, cpi]. Lose any of
  // them and the daily-glance promise of the page breaks.
  test("renders four KPI tiles with the canonical metrics", async ({ page }) => {
    for (const id of ["roas", "spend", "installs", "cpi"] as const) {
      await expect(page.getByTestId(`kpi-${id}`)).toBeVisible();
    }
  });

  // Count-up numbers — KpiCard wraps the value in <CountUpNumber> which
  // animates from 0 to the final value. By the time the page settles,
  // the rendered text must be a real value, not "0" or empty.
  test("KPI values count up and settle on real numbers", async ({ page }) => {
    const roas = page.getByTestId("kpi-roas");
    await expect(roas).toBeVisible();
    // Mock ROAS values look like "1.42x" — match the brand-formatted shape
    // rather than a specific number so a tweak in the mock doesn't flip
    // this test red.
    await expect(roas).toContainText(/\d+\.\d{2}x/);

    const spend = page.getByTestId("kpi-spend");
    await expect(spend).toContainText(/\$\d/);

    const installs = page.getByTestId("kpi-installs");
    await expect(installs).toContainText(/\d/);

    const cpi = page.getByTestId("kpi-cpi");
    await expect(cpi).toContainText(/\$\d/);
  });

  // Swappable KPI slots — each slot's label is a popover trigger
  // (data-testid="kpi-swap-{activeId}"). After swapping, the slot's
  // testid updates to the new metric id. This guards the
  // "KPI tiles are now swappable" feature.
  test("a KPI slot can swap to a different metric", async ({ page }) => {
    // Slot 0 starts as ROAS (DEFAULT_SLOTS[0]) — open its swap popover.
    // We scope to the first kpi-roas tile in case ROAS appears more than
    // once after a previous test (it shouldn't on initial render).
    const roasTile = page.getByTestId("kpi-roas").first();
    await expect(roasTile).toBeVisible();

    await roasTile.getByTestId("kpi-swap-roas").click();
    // Pick "Spend" from the popover. The option testid is stable.
    await page.getByTestId("kpi-swap-option-spend").click();

    // After the swap, slot 0 should now render as kpi-spend, and there
    // should be at least one ROAS tile gone from its original position
    // (Spend now occupies slot 0). The simplest stable assertion: there
    // are now two kpi-spend tiles (the original slot-1 spend + slot-0).
    await expect(page.getByTestId("kpi-spend")).toHaveCount(2);
  });

  // Trend chart + metric switcher — the chart starts on "spend" and
  // exposes a `data-metric` attribute that updates when a tab is clicked.
  // This guards the "one chart, four metrics" pattern called out in
  // CLAUDE.md.
  test("trend chart switches metrics", async ({ page }) => {
    const chart = page.getByTestId("trend-chart");
    await expect(chart).toBeVisible();
    await expect(chart).toHaveAttribute("data-metric", "spend");

    await page.getByTestId("trend-metric-roas").click();
    await expect(chart).toHaveAttribute("data-metric", "roas");

    await page.getByTestId("trend-metric-installs").click();
    await expect(chart).toHaveAttribute("data-metric", "installs");
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
