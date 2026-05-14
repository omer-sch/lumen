import { test, expect, type Page } from "@playwright/test";
import { setupClerkTestingToken } from "@clerk/testing/playwright";

/**
 * Pin lifecycle — generate a chart in Ask, pin it, confirm it shows up
 * on the dashboard's Pinned section, then unpin it and confirm it
 * disappears.
 *
 * The /api/pins endpoint is Supabase-backed in production; in preview
 * mode (and any CI run without Supabase env wired) the route returns
 * `{ persisted: false, tile: null }` and the local state still flips,
 * so the in-memory leg of this test is the canonical signal. We stub
 * GET /api/pins to start from an empty list so any leftover server-
 * side rows from a previous run don't pollute the assertion.
 */
test.describe("pin lifecycle", () => {
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

    // Stub all /api/bq/* routes to empty success responses — under
    // parallel load against a single dev server the real BQ fetches
    // can starve the dashboard render and the pinned section never
    // mounts. The pin lifecycle doesn't depend on real dashboard data,
    // so neutering the network keeps the test under timeout.
    await page.route("**/api/bq/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({}),
      }),
    );

    // Stateful in-test pin store. /api/pins is Supabase-backed in
    // production but returns persisted:false in preview, so without
    // this stub a fresh GET on the dashboard after the Ask-side POST
    // would return an empty list (the optimistic local state in Ask
    // dies on navigation). Mirror the API contract: GET reads what
    // POST wrote, DELETE evicts by id.
    type Tile = {
      id: string;
      userId: string;
      pinnedAt: number;
      label?: string;
      config: unknown;
    };
    let store: Tile[] = [];
    let nextId = 1;

    await page.route("**/api/pins", async (route) => {
      const req = route.request();
      if (req.method() === "GET") {
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ tiles: store }),
        });
      }
      if (req.method() === "POST") {
        try {
          const body = JSON.parse(req.postData() ?? "{}") as {
            label?: string;
            config?: unknown;
          };
          const tile: Tile = {
            id: `pin_${nextId++}`,
            userId: "test_user",
            pinnedAt: Date.now(),
            label: body.label,
            config: body.config,
          };
          store = [tile, ...store];
          return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ ok: true, persisted: true, tile }),
          });
        } catch {
          return route.fulfill({ status: 400, body: "bad body" });
        }
      }
      return route.continue();
    });
    await page.route(/.*\/api\/pins\/[^/]+$/, async (route) => {
      const req = route.request();
      if (req.method() === "DELETE") {
        const m = req.url().match(/\/api\/pins\/([^/?]+)/);
        const id = m?.[1];
        if (id) store = store.filter((t) => t.id !== id);
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true, persisted: true }),
        });
      }
      return route.continue();
    });
  });

  test("pin a chart from Ask, see it on the dashboard, unpin it", async ({
    page,
  }) => {
    // 1. Go to Ask and submit a query.
    await page.goto("/queries");
    const input = page.getByRole("textbox", { name: /ask lumen/i });
    await expect(input).toBeVisible();
    await input.fill("Show me spend by channel for last 30 days");
    await input.press("Enter");

    // The answer mounts as a card with the pin button. Find it by its
    // aria-label, which AnswerCard renders for the unpinned state.
    const pinBtn = page
      .getByRole("button", { name: /pin to dashboard/i })
      .first();
    await expect(pinBtn).toBeVisible({ timeout: 20_000 });

    // 2. Pin the chart. The Ask page mounts AnswerCard with `onPin` only,
    // so the button's aria-label does NOT flip to "Unpin from dashboard"
    // — that label only appears when the same card is rendered as a
    // pinned tile on the dashboard. We just click and wait for the
    // POST to /api/pins to land before navigating.
    const postPromise = page.waitForResponse(
      (res) =>
        res.url().endsWith("/api/pins") &&
        res.request().method() === "POST" &&
        res.ok(),
    );
    await pinBtn.click();
    await postPromise;

    // 3. Navigate to the dashboard and confirm the pinned section is
    // visible with at least one tile.
    await page.goto("/dashboard");
    await dismissNotificationsIfOpen(page);

    const pinnedSection = page.getByTestId("pinned-section");
    await expect(pinnedSection).toBeVisible({ timeout: 30_000 });

    const tiles = pinnedSection.locator('[data-testid^="pinned-tile-"]');
    await expect(tiles.first()).toBeVisible();
    const beforeCount = await tiles.count();
    expect(beforeCount).toBeGreaterThanOrEqual(1);

    // 4. Unpin the tile. The PinnedSection emits an "Unpin"
    // aria-label button on each tile.
    await pinnedSection
      .getByRole("button", { name: /^unpin$/i })
      .first()
      .click();

    // 5. Tile disappears. The optimistic update is synchronous so we
    // can assert the new count immediately, but give it a beat in case
    // the animation defers the unmount.
    await expect(async () => {
      const afterCount = await tiles.count();
      expect(afterCount).toBe(beforeCount - 1);
    }).toPass({ timeout: 5_000 });
  });
});

async function dismissNotificationsIfOpen(page: Page) {
  const close = page.getByRole("button", { name: /close notifications/i });
  if (await close.isVisible().catch(() => false)) {
    await close.click().catch(() => {});
  }
}
