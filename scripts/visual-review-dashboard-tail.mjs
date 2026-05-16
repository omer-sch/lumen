// Fills the two screenshots that failed at the tail of the full review
// run (Clerk session likely rotated across the rapid context churn).
// Uses a single browser context for both shots and re-reads the freshly
// refreshed storage state.

import path from "node:path";
import { chromium } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3001";
const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const STORAGE_STATE = path.join(REPO_ROOT, "tests", ".auth", "user.json");
const OUT_DIR =
  "/Users/omer/Documents/Claude/Projects/yellow head/visual-reviews/dashboard-2026-05-14/screenshots";

async function settle(page) {
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForSelector('[data-testid="kpi-roas"], [data-testid="kpi-spend"]', {
    timeout: 15_000,
  }).catch(() => {});
  await page.waitForSelector('[data-testid="trend-chart"]', { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(1600);
}

async function gotoDashboard(page) {
  await page.context().addCookies([
    {
      name: "lumen.welcomed.last",
      value: new Date().toISOString().slice(0, 10),
      url: BASE_URL,
      sameSite: "Lax",
    },
  ]);
  await page.goto(`${BASE_URL}/dashboard`, { waitUntil: "domcontentloaded" });
  await settle(page);
}

async function shot(page, name) {
  const file = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`✓ ${name}.png`);
}

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    storageState: STORAGE_STATE,
  });
  const page = await ctx.newPage();

  await gotoDashboard(page);

  // Data-quality callout — InfoCallout is rendered inline under the KPI
  // strip when the active client carries a coverage notice.
  const callout = page.getByTestId("dashboard-quality-callout");
  if (await callout.count()) {
    await callout.scrollIntoViewIfNeeded();
  } else {
    await page.evaluate(() => window.scrollTo(0, 0));
  }
  await page.waitForTimeout(400);
  await shot(page, "data-quality-expanded-desktop");

  // Reset scroll, then Tab into a primary control so the focus ring is
  // visible in the screenshot.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(150);
  await page.locator("body").click({ position: { x: 700, y: 400 } });
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press("Tab");
    const ok = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el) return false;
      const tag = el.tagName?.toLowerCase();
      const role = el.getAttribute("role");
      return tag === "button" || role === "tab" || role === "button";
    });
    if (ok) break;
  }
  await page.waitForTimeout(250);
  await shot(page, "focus-ring-desktop");

  await ctx.close();
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
