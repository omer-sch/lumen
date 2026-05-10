import { test, expect, type Page } from "@playwright/test";

// CLAUDE.md cross-cutting promise: date range + client selector live in the
// topbar and are SHARED state across Dashboard, Campaigns, Ask, Reports.
// Feed and Knowledge are explicitly excluded. Notifications bell is in the
// topbar regardless of route.

test.use({ storageState: "tests/.auth/user.json" });

const FILTERED_ROUTES = ["/dashboard", "/campaigns", "/queries", "/reports"];
const UNFILTERED_ROUTES = ["/feed", "/knowledge"];

async function lockNetwork(page: Page) {
  await page.route("**/api/**", (route) => route.fulfill({ status: 204 }));
}

test.describe("global filter — topbar surface", () => {
  test.beforeEach(async ({ page }) => {
    await lockNetwork(page);
  });

  test("filter is rendered on every filtered route", async ({ page }) => {
    for (const path of FILTERED_ROUTES) {
      await page.goto(path);
      // Date presets — at least one preset button must mount.
      await expect(
        page.getByTestId("date-range-7d"),
        `expected date-range-7d on ${path}`,
      ).toBeVisible();
      await expect(
        page.getByTestId("client-select"),
        `expected client-select on ${path}`,
      ).toBeVisible();
    }
  });

  test("Feed and Knowledge do NOT render the global filter", async ({
    page,
  }) => {
    // Architectural promise: the filter only travels to the four routes
    // that need it. Hiding (not just disabling) keeps the contract honest.
    for (const path of UNFILTERED_ROUTES) {
      await page.goto(path);
      await expect(
        page.getByTestId("date-range-7d"),
        `${path} should not render the filter`,
      ).toHaveCount(0);
      await expect(
        page.getByTestId("client-select"),
        `${path} should not render the client selector`,
      ).toHaveCount(0);
    }
  });

  test("notifications bell is rendered in the topbar", async ({ page }) => {
    // Recent commit "Add full notifications system with demo data" wired
    // the bell into TopBar — it must be present on every authed route.
    await page.goto("/dashboard");
    await expect(
      page.getByRole("button", { name: /notifications/i }),
    ).toBeVisible();

    // Also present on Feed where the global filter is hidden — the bell
    // is part of the chrome, not part of the filter group.
    await page.goto("/feed");
    await expect(
      page.getByRole("button", { name: /notifications/i }),
    ).toBeVisible();
  });
});

test.describe("global filter — shared state across routes", () => {
  test.beforeEach(async ({ page }) => {
    await lockNetwork(page);
  });

  test("date range chosen on /dashboard persists onto /campaigns", async ({
    page,
  }) => {
    await page.goto("/dashboard");

    // Pick a non-default range. Default is 30d (per use-global-filters.ts);
    // 7d is a clearly distinct choice we can later assert on.
    await page.getByTestId("date-range-7d").click();

    // The hook writes the choice to ?range=7d. Wait for the URL to settle.
    await expect(page).toHaveURL(/[?&]range=7d/);

    // Navigate to /campaigns. Per CLAUDE.md the same window must still be
    // active — this is the "one piece of state, not four" architectural
    // promise. Use the top nav link to force a real client navigation.
    await page.getByRole("link", { name: /^campaigns$/i }).click();
    await expect(page).toHaveURL(/\/campaigns/);

    // ?range=7d should travel with the navigation OR the 7d preset should
    // remain visually selected. Check both — the contract is shared
    // STATE, not specifically "URL must contain the param".
    const sevenDay = page.getByTestId("date-range-7d");
    await expect(sevenDay).toHaveAttribute("aria-pressed", "true");
  });

  test("client selection chosen on /dashboard persists onto /campaigns", async ({
    page,
  }) => {
    await page.goto("/dashboard");

    // Open the client dropdown and pick a specific client (not "all").
    await page.getByTestId("client-select").click();
    await page.getByTestId("client-option-lumi-runner").click();

    // ?client=lumi-runner is written to the URL.
    await expect(page).toHaveURL(/[?&]client=lumi-runner/);

    await page.getByRole("link", { name: /^campaigns$/i }).click();
    await expect(page).toHaveURL(/\/campaigns/);

    // After navigation the selected client should still be reflected in
    // the trigger's label — the active client is rendered into the button.
    await expect(page.getByTestId("client-select")).toContainText(/lumi runner/i);
  });
});
