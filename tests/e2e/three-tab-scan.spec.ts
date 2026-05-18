// Diagnostic scan: visit each of the three dashboard tabs against real
// Clerk + real BQ, capture topbar + tab body screenshots so we can eyeball
// the IA. Not a pass/fail spec - exists to give the reviewer (and Claude)
// concrete evidence of what each tab actually renders.

import { test, expect } from "@playwright/test";
import path from "node:path";

const OUT = path.join(process.cwd(), "test-results", "three-tab-scan");

test("dashboard three-tab IA scan", async ({ page }) => {
  test.setTimeout(120_000);

  await page.setViewportSize({ width: 1440, height: 900 });

  // Performance tab (default).
  await page.goto("/dashboard", { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  await page.screenshot({
    path: path.join(OUT, "performance-1440.png"),
    fullPage: true,
  });

  // Lifecycle tab. URL drives the tab so we can navigate via the bar too.
  await page.goto("/dashboard?tab=lifecycle", { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  await page.screenshot({
    path: path.join(OUT, "lifecycle-1440.png"),
    fullPage: true,
  });
  // Confirm OS + Platform chips DO NOT mount on this tab.
  const osChip = page.getByTestId("os-filter-trigger");
  const platformChip = page.getByTestId("platform-filter-trigger");
  expect(await osChip.count(), "OS chip must unmount on lifecycle").toBe(0);
  expect(
    await platformChip.count(),
    "Platform chip must unmount on lifecycle",
  ).toBe(0);

  // Attribution tab.
  await page.goto("/dashboard?tab=attribution", { waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  await page.screenshot({
    path: path.join(OUT, "attribution-1440.png"),
    fullPage: true,
  });

  // OS + Platform chips return on Attribution.
  expect(
    await page.getByTestId("os-filter-trigger").count(),
    "OS chip must mount on attribution",
  ).toBeGreaterThan(0);
  expect(
    await page.getByTestId("platform-filter-trigger").count(),
    "Platform chip must mount on attribution",
  ).toBeGreaterThan(0);
});
