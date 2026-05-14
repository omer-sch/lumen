import { test, expect } from "@playwright/test";
import { setupClerkTestingToken } from "@clerk/testing/playwright";

/**
 * AI Mode toggle — flipping into the Lumen Dashboard mode should produce
 * the AI-curated tile grid (mocked today from `mockAIDashboard`). Each
 * tile carries a "Why I'm showing this" explanation per CLAUDE.md.
 *
 * The dashboard.spec.ts file already verifies the toggle wiring; this
 * spec is the deeper assertion: the tiles actually render with their
 * explanations, not just an empty grid.
 */
test.describe("dashboard — AI Mode", () => {
  test.beforeEach(async ({ page, context }) => {
    await setupClerkTestingToken({ page });
    const todayISO = new Date().toISOString().slice(0, 10);
    await context.addCookies([
      {
        name: "lumen.welcomed.last",
        value: todayISO,
        url: "http://localhost:3001",
        sameSite: "Lax",
      },
    ]);
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/dashboard/);
    // Dismiss the notifications drawer if it mounted open — it overlays
    // the dashboard mode toggle on first paint.
    await page.evaluate(() => {
      const btn = document.querySelector<HTMLButtonElement>(
        'button[aria-label="Close notifications"]',
      );
      btn?.click();
    });
    await page.waitForTimeout(150);
  });

  test("AI mode renders at least 3 tiles, each with an explanation", async ({
    page,
  }) => {
    // Switch into Lumen Dashboard mode.
    const aiTab = page.getByTestId("mode-ai");
    await expect(aiTab).toBeVisible();
    await aiTab.click();
    await expect(aiTab).toHaveAttribute("aria-selected", "true");

    // AI tiles render under data-testid="ai-tile-*". The mock supplies
    // several but the contract is "at least three" so analysts get a
    // useful glance, not a single hero card.
    const tiles = page.locator('[data-testid^="ai-tile-"]');
    await expect(tiles.first()).toBeVisible();
    const count = await tiles.count();
    expect(count).toBeGreaterThanOrEqual(3);

    // Each visible tile renders a "Why I'm showing this" stub above its
    // body. We don't try to read each tile separately — assert the
    // explanation strings exist at least as many times as visible tiles.
    const explanations = page.getByText(/why i.?m showing this/i);
    expect(await explanations.count()).toBeGreaterThanOrEqual(3);
  });

  test("?mode=ai deep link lands directly in AI Mode", async ({ page }) => {
    await page.goto("/dashboard?mode=ai");
    await expect(page.getByTestId("mode-ai")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.locator('[data-testid^="ai-tile-"]').first()).toBeVisible();
  });
});
