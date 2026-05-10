import { test, expect, type Page } from "@playwright/test";

// Authenticated state is built by a sibling fixture; consume it here.
test.use({ storageState: "tests/.auth/user.json" });

// Feed shows AI-surfaced anomalies/trends/recommendations. Severity types
// per CLAUDE.md: Highlight, Spike, Drop, Info. Drill-in shows chart +
// affected campaigns + recommended action. Feed picks its own time window
// (the global filter must NOT travel into Feed).

const FEED_PATH = "/feed";

// Block any outbound /api/* call we don't expect — keeps tests hermetic.
async function lockNetwork(page: Page) {
  await page.route("**/api/**", (route) => route.fulfill({ status: 204 }));
}

test.describe("feed page", () => {
  test.beforeEach(async ({ page }) => {
    await lockNetwork(page);
  });

  test("renders AI insight cards", async ({ page }) => {
    await page.goto(FEED_PATH);
    // The header is the page's brand promise — proves we landed on Feed,
    // not a Clerk redirect or an error boundary.
    await expect(
      page.getByRole("heading", { name: /what lumen noticed/i }),
    ).toBeVisible();

    // Mock fixture has 4 items; if the data layer regresses to 0 the test
    // fails loudly rather than passing on an empty grid.
    const cards = page.locator('[data-testid^="feed-card-"]');
    await expect(cards).toHaveCount(4);
  });

  test("severity types are visually distinguished", async ({ page }) => {
    await page.goto(FEED_PATH);

    // Locate by the badge label text inside each card — that's the only
    // textual surface that distinguishes severity to an assistive user.
    // (Visual styling like glow color is intentionally NOT used as a
    // locator: the spec asks for accessible-name based assertions.)
    // Note: severity "info" surfaces as the badge "Insight" in the UI.
    await expect(page.getByText("Highlight", { exact: true })).toBeVisible();
    await expect(page.getByText("Spike", { exact: true })).toBeVisible();
    await expect(page.getByText("Drop", { exact: true })).toBeVisible();
    await expect(page.getByText("Insight", { exact: true })).toBeVisible();
  });

  test("clicking a card opens drill-in with chart, campaigns, and action", async ({
    page,
  }) => {
    await page.goto(FEED_PATH);

    // Click the first card. role="button" is set on the GlassCard wrapper
    // when onSelect is wired — the most stable selector.
    const firstCard = page.locator('[data-testid^="feed-card-"]').first();
    await firstCard.click();

    // The detail panel is a role=dialog with aria-label = item title.
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Supporting chart section header
    await expect(
      dialog.getByRole("heading", { name: /supporting chart/i }),
    ).toBeVisible();

    // Affected campaigns section header
    await expect(
      dialog.getByRole("heading", { name: /affected campaigns/i }),
    ).toBeVisible();

    // Recommended action — labelled section, body is the one-liner.
    await expect(dialog.getByText(/recommended action/i)).toBeVisible();

    // Esc closes — required behaviour per FeedDetailPanel.
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  });

  test("global filter does not change the Feed time window", async ({
    page,
  }) => {
    // Spec: Feed and Knowledge are NOT affected by the global filter.
    // The TopBar enforces this by hiding the filter UI on /feed entirely.
    await page.goto(FEED_PATH);

    // Date-range presets and the client selector should NOT be in the DOM.
    await expect(page.getByTestId("date-range-7d")).toHaveCount(0);
    await expect(page.getByTestId("date-range-30d")).toHaveCount(0);
    await expect(page.getByTestId("client-select")).toHaveCount(0);

    // Even if a stale ?range= param leaks via deep link, the Feed window
    // label must keep saying "last 24h" — Feed picks its own window.
    await page.goto(`${FEED_PATH}?range=90d&client=lumi-runner`);
    await expect(page.getByText(/last 24h/i)).toBeVisible();
  });

  test.fixme(
    "empty state when there are no insights",
    async ({ page }) => {
      // FeedView currently renders MOCK_FEED unconditionally — no empty
      // state branch exists. Until the view accepts an injectable data
      // source (or wires to a real API we can stub via page.route), there
      // is no path to drive the grid to zero items from a Playwright test.
      await page.goto(FEED_PATH);
      await expect(page.getByText(/no insights/i)).toBeVisible();
    },
  );
});
