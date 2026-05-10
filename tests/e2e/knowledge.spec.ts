import { test, expect, type Page } from "@playwright/test";

// Knowledge is the AI brain page: connected sources, learned patterns,
// stats. Per CLAUDE.md, this page is not affected by the global filter.

test.use({ storageState: "tests/.auth/user.json" });

const KNOWLEDGE_PATH = "/knowledge";

async function lockNetwork(page: Page) {
  await page.route("**/api/**", (route) => route.fulfill({ status: 204 }));
}

test.describe("knowledge page", () => {
  test.beforeEach(async ({ page }) => {
    await lockNetwork(page);
  });

  test("renders the brand header", async ({ page }) => {
    await page.goto(KNOWLEDGE_PATH);
    // Proves we landed on Knowledge, not a redirect.
    await expect(
      page.getByRole("heading", { name: /what lumen/i }),
    ).toBeVisible();
  });

  test("connected data sources are listed", async ({ page }) => {
    await page.goto(KNOWLEDGE_PATH);

    // The "Connected sources" pillar names every platform Rivery feeds
    // into Lumen. If the copy regresses we want to know — these are the
    // user's mental model of what data the AI sees.
    const sources = page.getByText(/connected sources/i).first();
    await expect(sources).toBeVisible();

    // Each source is named in the body copy. Asserting the platform names
    // catches accidental rewrites that drop a source from the brain.
    const body = page.getByText(/Meta, TikTok, Google, AppsFlyer/);
    await expect(body).toBeVisible();
  });

  test("learned patterns are rendered", async ({ page }) => {
    await page.goto(KNOWLEDGE_PATH);

    // The "Learned context" pillar is the hero card. Its body explains
    // what kinds of patterns Lumen has captured.
    await expect(
      page.getByRole("heading", { name: /learned context/i }),
    ).toBeVisible();
    await expect(
      page.getByText(/improves with every question asked/i),
    ).toBeVisible();
  });

  test("stats section: patterns learned, sources connected, KPI targets tracked", async ({
    page,
  }) => {
    await page.goto(KNOWLEDGE_PATH);

    // The three stat tiles are the tangible "what does the brain know"
    // surface. Labels are the stable contract; the count-up numbers
    // animate so don't assert their exact values.
    await expect(page.getByText("Patterns learned", { exact: true })).toBeVisible();
    await expect(page.getByText("Sources connected", { exact: true })).toBeVisible();
    await expect(page.getByText("KPI targets tracked", { exact: true })).toBeVisible();
  });

  test("global filter is not present on Knowledge", async ({ page }) => {
    // Per CLAUDE.md cross-cutting rules, /knowledge is not time-bound.
    await page.goto(KNOWLEDGE_PATH);
    await expect(page.getByTestId("date-range-7d")).toHaveCount(0);
    await expect(page.getByTestId("client-select")).toHaveCount(0);
  });
});
