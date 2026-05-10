import { test, expect } from "@playwright/test";

// Campaign profile is the drill-in target for every row in /campaigns. These
// specs exercise the path the user actually takes — click a row, land on
// /campaigns/[id], read the campaign-specific KPIs and trend chart, then
// step back. Auth gated like the rest of (app)/*.
test.use({ storageState: "tests/.auth/user.json" });

test.describe("/campaigns/[id] profile", () => {
  test("clicking a row in /campaigns navigates to that campaign's profile", async ({
    page,
  }) => {
    await page.goto("/campaigns");

    // Use the Meta_Promo_Q2 row — it's seeded with the highest weight in
    // the Meta channel so it always renders.
    await page
      .getByTestId("campaign-row-meta-promo-q2")
      .getByRole("link", { name: /Open Meta_Promo_Q2/i })
      .click();

    await expect(page).toHaveURL(/\/campaigns\/meta-promo-q2(\?|$)/);

    // The profile h2 is the campaign's display name — verifies we landed
    // on the right campaign, not just any /campaigns/* page.
    await expect(
      page.getByRole("heading", { name: "Meta_Promo_Q2", level: 2 }),
    ).toBeVisible();
  });

  test("profile renders campaign name, four KPI tiles, and the historical trend chart", async ({
    page,
  }) => {
    // Direct deep-link — same surface the app produces when a row link
    // is clicked, but isolates this test from the table's behavior.
    await page.goto("/campaigns/g-uac-search");

    // Name as page heading.
    await expect(
      page.getByRole("heading", { name: "G_UAC_Search", level: 2 }),
    ).toBeVisible();

    // KPI strip — four tiles for ROAS / Spend / Installs / CPI. The KpiCard
    // renders each label as text; we don't care about exact values, only
    // that all four labels are present (proves the tile loop ran).
    await expect(page.getByText("ROAS (D7)", { exact: true })).toBeVisible();
    await expect(page.getByText("Spend", { exact: true })).toBeVisible();
    await expect(page.getByText("Installs", { exact: true })).toBeVisible();
    await expect(page.getByText("CPI", { exact: true })).toBeVisible();

    // Historical chart — TrendChart tags itself with a stable testid and
    // exposes the active metric via data-metric. We only assert visibility
    // and that the metric switcher is wired.
    const chart = page.getByTestId("trend-chart");
    await expect(chart).toBeVisible();
    await expect(page.getByTestId("trend-metric-roas")).toBeVisible();
  });

  test("invalid campaign id returns 404", async ({ page }) => {
    // generateStaticParams + the in-component guard route unknown ids to
    // notFound(). Make sure that contract holds — a bad id must not
    // silently render an empty profile.
    const r = await page.goto("/campaigns/this-is-not-a-real-campaign");
    expect(r?.status()).toBe(404);
  });

  test("back navigation returns to /campaigns with the global filter state preserved", async ({
    page,
  }) => {
    // Open the profile with a non-default filter set so we can prove the
    // back-link carries them. CampaignProfile builds the back href from
    // window.location.search at render time, so the test exercises the
    // full client-side round-trip.
    await page.goto("/campaigns/meta-promo-q2?range=7d&client=lumi-runner");

    // The "Back to campaigns" breadcrumb is the canonical back-affordance.
    const back = page.getByRole("link", { name: /Back to campaigns/i }).first();
    await expect(back).toBeVisible();

    // Href must include the same range + client params we arrived with.
    await expect(back).toHaveAttribute(
      "href",
      /\/campaigns\?.*range=7d.*client=lumi-runner/,
    );

    await back.click();
    await expect(page).toHaveURL(/\/campaigns\?.*range=7d.*client=lumi-runner/);
    // Header on /campaigns reflects the same client + window — proves the
    // filter survived the round-trip, not just the URL.
    await expect(page.getByText(/UA · Lumi Runner · last 7 days/i)).toBeVisible();
  });
});
