// Recapture the Lumen Dashboard (AI mode) screenshot using a direct URL
// (?mode=ai) — useDashboardMode reads the mode from the search params, so
// driving it via the URL is more reliable than racing the client-side
// router.replace from a button click.

import path from "node:path";
import { chromium } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3001";
const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const STORAGE_STATE = path.join(REPO_ROOT, "tests", ".auth", "user.json");
const OUT_DIR =
  "/Users/omer/Documents/Claude/Projects/yellow head/visual-reviews/dashboard-2026-05-14/screenshots";

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    storageState: STORAGE_STATE,
  });
  const page = await ctx.newPage();

  await page.context().addCookies([
    {
      name: "lumen.welcomed.last",
      value: new Date().toISOString().slice(0, 10),
      url: BASE_URL,
      sameSite: "Lax",
    },
  ]);

  await page.goto(`${BASE_URL}/dashboard?mode=ai`, { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("networkidle").catch(() => {});
  // Wait for the AI-mode header copy to confirm the right view rendered.
  await page.waitForFunction(
    () => document.body.innerText.includes("What Lumen thinks"),
    { timeout: 15_000 },
  ).catch(() => {});
  await page.waitForTimeout(1200);

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: path.join(OUT_DIR, "ai-mode-desktop.png"),
    fullPage: true,
  });
  console.log("✓ ai-mode-desktop.png (recaptured)");

  await ctx.close();
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
