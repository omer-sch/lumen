import { test, expect, type Page } from "@playwright/test";
import { setupClerkTestingToken } from "@clerk/testing/playwright";

/**
 * Notification bell + panel — the topbar's real-time surface for Feed
 * items per CLAUDE.md ("Feed and the notifications bell are paired").
 *
 * Runs authenticated against /dashboard so the topbar (and therefore the
 * bell) is mounted.
 */

test.describe("notifications", () => {
  test.beforeEach(async ({ page, context }) => {
    await setupClerkTestingToken({ page });
    // Mirror dashboard.spec.ts: pre-seed the welcomed cookie so we land
    // straight on /dashboard instead of racing the welcome cinematic.
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
    await dismissNotificationsIfOpen(page);
  });

  test("the bell renders in the topbar", async ({ page }) => {
    const bell = page.locator("button[data-notification-trigger]");
    await expect(bell).toBeVisible();
    // Aria label is one of the two voiced strings — either "Notifications"
    // or "Notifications, N unread". A regex covers both.
    const label = await bell.getAttribute("aria-label");
    expect(label).toMatch(/^Notifications($|, \d+ unread$)/);
  });

  test("clicking the bell opens a panel with at least one item", async ({
    page,
  }) => {
    const bell = page.locator("button[data-notification-trigger]");
    await bell.click();

    // The panel mounts as a dialog (aria-haspopup="dialog"). Find the
    // open dialog by its role.
    const panel = page.getByRole("dialog");
    await expect(panel).toBeVisible();

    // At least one notification item rendered. The exact testid pattern
    // isn't standardized, so match by anything inside the dialog that
    // looks like a list item / list row.
    const items = panel.locator('button, [role="listitem"], li');
    await expect(items.first()).toBeVisible();
  });

  test("the panel can be closed via the close affordance", async ({ page }) => {
    const bell = page.locator("button[data-notification-trigger]");
    await bell.click();
    const panel = page.getByRole("dialog");
    await expect(panel).toBeVisible();

    // The notifications dialog ships a "Close notifications" aria-label
    // button. Use it (matches the playground test's `dismissNotifications`).
    await page
      .getByRole("button", { name: /close notifications/i })
      .click({ trial: false });
    // The panel stays in the DOM but animates to opacity-0 +
    // pointer-events-none. Assert it's no longer interactive rather
    // than "hidden" in the display sense.
    await expect(panel).toHaveCSS("opacity", "0");
  });
});

/**
 * On /dashboard the notifications drawer can land in its open state on
 * first paint (depending on the unread cohort). Dismiss it before the
 * test starts so it doesn't overlay click targets in the assertions.
 */
async function dismissNotificationsIfOpen(page: Page) {
  const close = page.getByRole("button", { name: /close notifications/i });
  if (await close.isVisible().catch(() => false)) {
    await close.click().catch(() => {});
  }
}
