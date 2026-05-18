// Focused topbar scan: capture just the header at full resolution so we
// can actually inspect what's in the row. Mocks all /api/bq/* so the
// page renders happy-path and the topbar settles.

import { test, expect } from "@playwright/test";
import path from "node:path";

const OUT = path.join(process.cwd(), "test-results", "topbar-scan");

test("topbar at 1440 + 1024", async ({ page }) => {
  test.setTimeout(60_000);

  // Quick mocks: return empty arrays / placeholder objects for every
  // BQ route so the page can render without an error tile. The point
  // is to inspect topbar layout, not data correctness.
  await page.route(/\/api\/bq\//, (route) => {
    const url = route.request().url();
    let body: unknown = [];
    if (url.includes("dashboard-kpis"))
      body = { spend: 285000, installs: 199475, cpi: 1.49, roas: 0.298 };
    else if (url.includes("freshness"))
      body = { lastUpdated: new Date().toISOString(), hoursAgo: 6, dataAsOf: "2026-05-13" };
    else if (url.includes("data-bounds"))
      body = { earliest: "2026-01-01", latest: "2026-05-14" };
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });

  for (const width of [1440, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/dashboard", { waitUntil: "networkidle" });
    await page.waitForTimeout(700);

    const header = page.locator("header").first();
    await header.screenshot({
      path: path.join(OUT, `topbar-${width}.png`),
    });

    // Also capture the OS dropdown open + Platform dropdown open at 1440.
    if (width === 1440) {
      const osBtn = page.getByTestId("os-filter-trigger");
      if (await osBtn.count()) {
        await osBtn.click();
        await page.waitForTimeout(200);
        await page.screenshot({
          path: path.join(OUT, `topbar-1440-os-open.png`),
          fullPage: false,
          clip: { x: 0, y: 0, width: 1440, height: 360 },
        });
        await page.keyboard.press("Escape");
        await page.waitForTimeout(150);
      }

      const platformBtn = page.getByTestId("platform-filter-trigger");
      if (await platformBtn.count()) {
        await platformBtn.click();
        await page.waitForTimeout(200);
        await page.screenshot({
          path: path.join(OUT, `topbar-1440-platform-open.png`),
          fullPage: false,
          clip: { x: 0, y: 0, width: 1440, height: 480 },
        });
      }
    }
  }

  expect(true).toBe(true);
});
