// One-shot visual review of /dashboard. Loads tests/.auth/user.json so
// every page mounts as the signed-in Clerk test user, then captures the
// 10 screenshots required by the dashboard-2026-05-14 visual review:
//   - default (desktop / tablet / mobile)
//   - Lumen Dashboard ("AI mode") toggle ON (desktop)
//   - trend chart metric switcher open (desktop)
//   - trend chart on CPI (desktop)
//   - global filter Custom popover open (desktop)
//   - hover on a KPI tile (desktop)
//   - data-quality callout visible (desktop)
//   - focus ring on a primary action (desktop)
//
// Outputs to:
//   /Users/omer/Documents/Claude/Projects/yellow head/visual-reviews/
//     dashboard-2026-05-14/screenshots/*.png
//
// Run with: node scripts/visual-review-dashboard.mjs

import path from "node:path";
import fs from "node:fs/promises";
import { chromium } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3001";
const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const STORAGE_STATE = path.join(REPO_ROOT, "tests", ".auth", "user.json");
const OUT_DIR =
  "/Users/omer/Documents/Claude/Projects/yellow head/visual-reviews/dashboard-2026-05-14/screenshots";

const VIEWPORTS = {
  desktop: { width: 1440, height: 900 },
  tablet:  { width: 1024, height: 768 },
  mobile:  { width:  390, height: 844 },
};

async function settle(page) {
  // Wait for the dashboard's main data sections to mount, then give the
  // count-up + stagger animations time to land before snapping.
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForSelector('[data-testid="kpi-roas"], [data-testid="kpi-spend"]', {
    timeout: 15_000,
  }).catch(() => {});
  await page.waitForSelector('[data-testid="trend-chart"]', { timeout: 15_000 }).catch(() => {});
  // KpiCard's CountUp runs ~1100–1400ms; pad to be safe.
  await page.waitForTimeout(1600);
}

async function gotoDashboard(page) {
  // Pre-seed the welcome cookie so we don't get bounced through /welcome.
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

async function captureDefault(browser, viewport, label) {
  const ctx = await browser.newContext({
    viewport,
    deviceScaleFactor: 2,
    storageState: STORAGE_STATE,
  });
  const page = await ctx.newPage();
  await gotoDashboard(page);
  await shot(page, `default-${label}`);
  await ctx.close();
}

async function captureDesktopInteractives(browser) {
  // 1) Lumen Dashboard (AI) mode on.
  {
    const ctx = await browser.newContext({
      viewport: VIEWPORTS.desktop,
      deviceScaleFactor: 2,
      storageState: STORAGE_STATE,
    });
    const page = await ctx.newPage();
    await gotoDashboard(page);
    await page.getByTestId("mode-ai").click();
    await page.waitForTimeout(900);
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, "ai-mode-desktop");
    await ctx.close();
  }

  // 2) Trend chart metric switcher — every metric button is already
  // visible (no popover), so we capture the page focused on the row of
  // tabs as the "open" affordance.
  {
    const ctx = await browser.newContext({
      viewport: VIEWPORTS.desktop,
      deviceScaleFactor: 2,
      storageState: STORAGE_STATE,
    });
    const page = await ctx.newPage();
    await gotoDashboard(page);
    // Scroll the trend chart into view, then hover the active tab so the
    // metric row is obviously in focus.
    await page.getByTestId("trend-chart").scrollIntoViewIfNeeded();
    await page.getByTestId("trend-metric-spend").hover();
    await page.waitForTimeout(300);
    await shot(page, "trend-switcher-open-desktop");
    await ctx.close();
  }

  // 3) Trend chart on a non-default metric (CPI).
  {
    const ctx = await browser.newContext({
      viewport: VIEWPORTS.desktop,
      deviceScaleFactor: 2,
      storageState: STORAGE_STATE,
    });
    const page = await ctx.newPage();
    await gotoDashboard(page);
    await page.getByTestId("trend-chart").scrollIntoViewIfNeeded();
    await page.getByTestId("trend-metric-cpi").click();
    await page.waitForTimeout(900);
    await shot(page, "trend-cpi-desktop");
    await ctx.close();
  }

  // 4) Global filter Custom popover open.
  {
    const ctx = await browser.newContext({
      viewport: VIEWPORTS.desktop,
      deviceScaleFactor: 2,
      storageState: STORAGE_STATE,
    });
    const page = await ctx.newPage();
    await gotoDashboard(page);
    await page.getByTestId("date-range-custom").click();
    await page.waitForSelector('[role="dialog"][aria-label="Custom date range"]', {
      timeout: 5000,
    }).catch(() => {});
    await page.waitForTimeout(250);
    await shot(page, "global-filter-open-desktop");
    await ctx.close();
  }

  // 5) Hover on a KPI tile (the hero — roas slot 0).
  {
    const ctx = await browser.newContext({
      viewport: VIEWPORTS.desktop,
      deviceScaleFactor: 2,
      storageState: STORAGE_STATE,
    });
    const page = await ctx.newPage();
    await gotoDashboard(page);
    const tile = page.getByTestId("kpi-roas").first();
    await tile.scrollIntoViewIfNeeded();
    await tile.hover();
    await page.waitForTimeout(450);
    await shot(page, "kpi-hover-desktop");
    await ctx.close();
  }

  // 6) Data-quality callout visible. InfoCallout renders inside the KPI
  // section when coverage.qualityCallout is set — Global Comix (the only
  // multi-source pilot client) carries the Google iOS coverage notice.
  // The default global filter already selects Global Comix; the callout
  // is rendered open and only hides after a per-user dismiss.
  {
    const ctx = await browser.newContext({
      viewport: VIEWPORTS.desktop,
      deviceScaleFactor: 2,
      storageState: STORAGE_STATE,
    });
    const page = await ctx.newPage();
    await gotoDashboard(page);
    const callout = page.getByTestId("dashboard-quality-callout");
    if (await callout.count()) {
      await callout.scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      await shot(page, "data-quality-expanded-desktop");
    } else {
      // The callout isn't currently visible for the active client. Snap
      // the page anyway so the reviewer can see the absence and the
      // critique can flag it as an open question.
      await page.evaluate(() => window.scrollTo(0, 0));
      await shot(page, "data-quality-expanded-desktop");
    }
    await ctx.close();
  }

  // 7) Focus ring on a primary action. We Tab through the topbar/header
  // until a button inside the filter strip or dashboard mode toggle is
  // focused, then snap.
  {
    const ctx = await browser.newContext({
      viewport: VIEWPORTS.desktop,
      deviceScaleFactor: 2,
      storageState: STORAGE_STATE,
    });
    const page = await ctx.newPage();
    await gotoDashboard(page);
    // Click into the main content area to take focus off any auto-focused
    // element, then walk Tab → focus the first interactive button we hit.
    await page.locator("body").click({ position: { x: 700, y: 400 } });
    await page.keyboard.press("Tab");
    // Continue tabbing up to 12 times until focus lands on a button or a
    // role="tab" element so the ring is genuinely on a primary control.
    for (let i = 0; i < 12; i++) {
      const focused = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el) return null;
        const tag = el.tagName?.toLowerCase();
        const role = el.getAttribute("role");
        return { tag, role, testid: el.getAttribute("data-testid") };
      });
      if (
        focused &&
        (focused.tag === "button" || focused.role === "tab" || focused.role === "button")
      ) {
        break;
      }
      await page.keyboard.press("Tab");
    }
    await page.waitForTimeout(200);
    await shot(page, "focus-ring-desktop");
    await ctx.close();
  }
}

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  try {
    // Default state across viewports.
    await captureDefault(browser, VIEWPORTS.desktop, "desktop");
    await captureDefault(browser, VIEWPORTS.tablet,  "tablet");
    await captureDefault(browser, VIEWPORTS.mobile,  "mobile");

    // Desktop-only interactives.
    await captureDesktopInteractives(browser);
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
