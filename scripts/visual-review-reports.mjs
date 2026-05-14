// One-shot visual review of /reports. Loads tests/.auth/user.json so
// every page mounts as the signed-in Clerk test user, then captures the
// screenshots required by the reports-2026-05-14 visual review.
//
// The prompt was written before the carousel + yellowHEAD-format changes
// landed; both shipped in commit 5ae4b20. The screenshot list is adapted
// for the current surface: Document is the default view (Carousel is
// opt-in via the toggle because it clips campaign commentary in 16:9),
// the generated document uses the Android | Meta yellowHEAD sections
// (platform_overall, channel_weekly, channel_campaign), and the action
// bar carries the Carousel/Document toggle + Share link + PDF + PPTX.
//
// Design notes:
//  - We reuse ONE browser context across captures. Repeated context
//    churn against the Next.js dev server caused flaky /reports → fall-
//    back behaviour; reusing the page is faster and consistent.
//  - Between captures that need a clean builder, we navigate to a benign
//    page and clear the Reports localStorage key so the sidebar is empty.
//
// Outputs:
//   /Users/omer/Documents/Claude/Projects/yellow head/visual-reviews/
//     reports-2026-05-14/screenshots/*.png
//
// Run with: node scripts/visual-review-reports.mjs

import path from "node:path";
import fs from "node:fs/promises";
import { chromium } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3001";
const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const STORAGE_STATE = path.join(REPO_ROOT, "tests", ".auth", "user.json");
const OUT_DIR =
  "/Users/omer/Documents/Claude/Projects/yellow head/visual-reviews/reports-2026-05-14/screenshots";

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  tablet:  { width: 1024, height: 768 },
  mobile:  { width:  390, height: 844 },
};

const SEED_PROMPT =
  "Weekly UA performance summary for Global Comix with top campaigns and recommendations.";

// Local-storage key used by useReports() to persist the report list.
const REPORTS_LS_KEY = "lumen.reports";

async function makeContext(browser, viewport, permissions = []) {
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: 2,
    storageState: STORAGE_STATE,
    permissions,
  });
  await ctx.addCookies([
    {
      name: "lumen.welcomed.last",
      value: new Date().toISOString().slice(0, 10),
      url: BASE_URL,
      sameSite: "Lax",
    },
  ]);
  return ctx;
}

async function shot(page, name) {
  const file = path.join(OUT_DIR, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`✓ ${name}.png`);
}

/**
 * Navigate to /reports and wait until either the builder textarea or the
 * carousel region is present. Verifies the URL actually settled on the
 * reports route; if it ended up elsewhere (dev-server flake), reload once
 * and try again.
 */
async function gotoReports(page) {
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.goto(`${BASE_URL}/reports`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
    const url = page.url();
    if (!url.endsWith("/reports") && !url.includes("/reports?")) {
      console.log(`  goto landed on ${url}, retrying (attempt ${attempt + 2}/3)`);
      await page.waitForTimeout(500);
      continue;
    }
    const found = await page
      .waitForSelector(
        'textarea#report-prompt, [aria-roledescription="carousel"], article[data-report-doc]',
        { timeout: 15_000 },
      )
      .catch(() => null);
    if (found) {
      await page.waitForTimeout(700);
      return;
    }
    console.log(`  hydration timeout, retrying (attempt ${attempt + 2}/3)`);
  }
  throw new Error("Could not land on /reports after 3 attempts");
}

/**
 * Wipe the persisted Reports list so the builder shows an empty sidebar.
 * Reads the localStorage on the page's origin then forces a fresh load.
 */
async function clearReportsState(page) {
  await page.evaluate((key) => {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* noop */
    }
  }, REPORTS_LS_KEY);
}

/**
 * Generate the seed-prompt report and return once the rendered report
 * is mounted in whatever the current view mode is. We accept either the
 * carousel region or the document article so the script doesn't care
 * which mode is the current default.
 */
async function generateReport(page) {
  const textarea = page.locator("textarea#report-prompt");
  await textarea.waitFor({ state: "visible", timeout: 20_000 });
  await textarea.click();
  await textarea.fill(SEED_PROMPT);
  await page.getByRole("button", { name: /Generate report/ }).click();
  await page.waitForSelector(
    '[aria-roledescription="carousel"], article[data-report-doc]',
    { timeout: 10_000 },
  );
  await page.waitForTimeout(700);
}

async function seedSavedReport(page, prompt) {
  const textarea = page.locator("textarea#report-prompt");
  await textarea.waitFor({ state: "visible", timeout: 15_000 });
  await textarea.click();
  await textarea.fill(prompt);
  await page.getByRole("button", { name: /Generate report/ }).click();
  await page.waitForSelector(
    '[aria-roledescription="carousel"], article[data-report-doc]',
    { timeout: 8000 },
  );
  await page.waitForTimeout(400);
  // Return to the builder for the default-state capture.
  await page.getByRole("button", { name: /^New report$/ }).click();
  await page.waitForTimeout(400);
}

/** Explicit view-mode switches. Both views remain available; we just
 *  toggle into the one a given capture needs so the script is mode-safe
 *  regardless of which one defaults. */
async function switchToCarousel(page) {
  await page.getByRole("tab", { name: "Carousel" }).click();
  await page.waitForSelector('[aria-roledescription="carousel"]', {
    timeout: 6000,
  });
  await page.waitForTimeout(300);
}

async function switchToDocument(page) {
  await page.getByRole("tab", { name: "Document" }).click();
  await page.waitForSelector("article[data-report-doc]", { timeout: 6000 });
  await page.waitForTimeout(300);
}

async function navigateToSlide(page, slideIndex) {
  const dots = page.getByRole("tablist", { name: "Slide navigation" }).getByRole("tab");
  await dots.nth(slideIndex).click();
  await page.waitForTimeout(550); // TRANSITION_MS = 420ms
}

// ---------------------------------------------------------------------------
// Captures
// ---------------------------------------------------------------------------

/**
 * All captures run inside this single async fn against ONE shared page.
 * `viewport` lets us flip between desktop / tablet / mobile via
 * setViewportSize.
 */
async function runDesktopCaptures(page) {
  // ---- 1. Default state (with one saved report seeded) ----
  await clearReportsState(page);
  await gotoReports(page);
  await seedSavedReport(page, "Weekly UA performance summary for the team review");
  await shot(page, "default-desktop");

  // ---- 2. Builder focused with text ----
  await clearReportsState(page);
  await gotoReports(page);
  {
    const textarea = page.locator("textarea#report-prompt");
    await textarea.click();
    await textarea.fill(SEED_PROMPT);
    await page.waitForTimeout(250);
    await shot(page, "builder-focused-desktop");
  }

  // ---- 3. Builder generating ----
  await clearReportsState(page);
  await gotoReports(page);
  {
    const textarea = page.locator("textarea#report-prompt");
    await textarea.click();
    await textarea.fill(SEED_PROMPT);
    await page.getByRole("button", { name: /Generate report/ }).click();
    // 900ms simulated delay; snap mid-way.
    await page.waitForTimeout(350);
    await shot(page, "builder-generating-desktop");
    // Drain the generation so the next capture has a clean slate. Either
    // view-mode signal is acceptable; Document is the default but we
    // don't want to care which.
    await page
      .waitForSelector(
        '[aria-roledescription="carousel"], article[data-report-doc]',
        { timeout: 6000 },
      )
      .catch(() => {});
    await page.waitForTimeout(400);
  }

  // ---- 4–7. Carousel slides (cover, platform_overall, channel_weekly, channel_campaign) ----
  // Document is the default view, so we explicitly toggle to Carousel
  // for the slide captures.
  await clearReportsState(page);
  await gotoReports(page);
  await generateReport(page);
  await switchToCarousel(page);
  await navigateToSlide(page, 0);
  await shot(page, "report-cover-desktop");
  await navigateToSlide(page, 1);
  await shot(page, "report-platform-overall-desktop");
  await navigateToSlide(page, 2);
  await shot(page, "report-channel-weekly-desktop");
  await navigateToSlide(page, 3);
  await shot(page, "report-channel-campaign-desktop");

  // ---- 8. Document mode (same generated report) ----
  await switchToDocument(page);
  await page.waitForTimeout(500);
  await shot(page, "report-document-mode-desktop");

  // ---- 9. EditableText in edit mode (title) ----
  // Already on Document mode with a report; click the title textbox.
  {
    const titleBox = page.getByRole("textbox", { name: "Report title" });
    await titleBox.click();
    await page.waitForTimeout(350);
    await shot(page, "editable-text-edit-mode-desktop");
  }

  // ---- 10. Copied share link (back to Carousel for variety) ----
  await switchToCarousel(page);
  await page.getByRole("button", { name: /Share link/ }).click();
  // The "Copied" state lasts 2000ms.
  await page.waitForTimeout(350);
  await shot(page, "copied-share-link-desktop");

  // ---- 11–12. Sidebar hover + delete affordance ----
  // We already have one saved report from the carousel block. Hover it.
  {
    const sidebarFirst = page
      .getByRole("complementary", { name: "Saved reports" })
      .locator("ul > li")
      .first();
    await sidebarFirst.scrollIntoViewIfNeeded();
    await sidebarFirst.hover();
    await page.waitForTimeout(400);
    await shot(page, "sidebar-hover-desktop");

    const deleteBtn = sidebarFirst.getByRole("button", { name: "Delete report" });
    if (await deleteBtn.count()) {
      await deleteBtn.hover();
      await page.waitForTimeout(300);
    }
    await shot(page, "sidebar-delete-desktop");
  }

  // ---- 13. Preset hover ----
  await clearReportsState(page);
  await gotoReports(page);
  {
    const preset = page.getByRole("button", {
      name: /Weekly UA performance summary for the team review/i,
    });
    await preset.first().scrollIntoViewIfNeeded();
    await preset.first().hover();
    await page.waitForTimeout(350);
    await shot(page, "preset-hover-desktop");
  }
}

/**
 * Smaller-viewport extras for the critique's mobile/tablet sections.
 * We capture both the empty builder (= "default-tablet/mobile") and a
 * generated report on each smaller viewport.
 */
async function runSmallerViewports(page) {
  // Tablet
  await page.setViewportSize(VIEWPORTS.tablet);
  await clearReportsState(page);
  await gotoReports(page);
  await shot(page, "default-tablet");
  await generateReport(page);
  await shot(page, "report-tablet");

  // Mobile
  await page.setViewportSize(VIEWPORTS.mobile);
  await clearReportsState(page);
  await gotoReports(page);
  await shot(page, "default-mobile");
  await generateReport(page);
  await shot(page, "report-mobile");
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  try {
    const ctx = await makeContext(browser, VIEWPORTS.desktop, [
      "clipboard-read",
      "clipboard-write",
    ]);
    const page = await ctx.newPage();

    // First hit on Next.js dev compiles /reports; warm it once before
    // we start counting against the 15s hydration timeouts.
    await page.goto(`${BASE_URL}/reports`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2000);

    await runDesktopCaptures(page);
    await runSmallerViewports(page);

    await ctx.close();
  } finally {
    await browser.close();
  }
  console.log("\nAll screenshots written to:");
  console.log(`  ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
