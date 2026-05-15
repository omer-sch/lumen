// Capture clean per-slide PNGs (just the slide card, no surrounding UI) for
// the visual-QA subagent. Saves to OUT_DIR as slide-NN.png.
//
// Run: BASE_URL=http://localhost:3000 node scripts/capture-clean-slides.mjs

import path from "node:path";
import fs from "node:fs/promises";
import { chromium } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const STORAGE_STATE = path.join(REPO_ROOT, "tests", ".auth", "user.json");
const OUT_DIR =
  process.env.OUT_DIR ??
  "/Users/omer/Documents/Claude/Projects/yellow head/pptx-fixed-2026-05-15";

const SEED_PROMPT = "Weekly UA performance summary for the team review";

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({
      viewport: { width: 1600, height: 900 },
      deviceScaleFactor: 2,
      storageState: STORAGE_STATE,
    });
    await ctx.addCookies([
      {
        name: "lumen.welcomed.last",
        value: new Date().toISOString().slice(0, 10),
        url: BASE_URL,
        sameSite: "Lax",
      },
    ]);
    const page = await ctx.newPage();

    await page.goto(`${BASE_URL}/reports`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.localStorage.removeItem("lumen.reports"));
    await page.goto(`${BASE_URL}/reports`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("textarea#report-prompt", { timeout: 15_000 });

    const textarea = page.locator("textarea#report-prompt");
    await textarea.click();
    await textarea.pressSequentially(SEED_PROMPT, { delay: 5 });
    await page.waitForFunction(
      () => {
        const btn = Array.from(document.querySelectorAll("button")).find((b) =>
          /Generate report/.test(b.textContent ?? ""),
        );
        return btn && !btn.hasAttribute("disabled");
      },
      undefined,
      { timeout: 10_000 },
    );
    await page.getByRole("button", { name: /Generate report/ }).click();
    await page.waitForSelector(
      '[aria-roledescription="carousel"], article[data-report-doc]',
      { timeout: 15_000 },
    );
    await page.waitForTimeout(700);

    const carouselTab = page.getByRole("tab", { name: "Carousel" });
    if (await carouselTab.count()) {
      await carouselTab.click();
      await page.waitForSelector('[aria-roledescription="carousel"]');
      await page.waitForTimeout(500);
    }

    // Hide carousel chrome (prev/next chevrons) so they don't bleed into
    // the slide screenshots. They're absolutely positioned overlays that
    // don't belong to the slide content itself.
    await page.addStyleTag({
      content: `
        button[aria-label="Previous slide"],
        button[aria-label="Next slide"] {
          display: none !important;
        }
      `,
    });

    const dots = page.getByRole("tablist", { name: "Slide navigation" }).getByRole("tab");
    const total = await dots.count();
    console.log(`${total} slides to capture`);

    for (let i = 0; i < total; i++) {
      await dots.nth(i).click();
      await page.waitForTimeout(550);

      // Find the active slide card (the one that's not aria-hidden).
      const active = page
        .locator('[aria-roledescription="slide"]')
        .filter({ has: page.locator(":scope > *") })
        .first();
      // Better: pick the one with aria-hidden="false".
      const activeSlide = page.locator(
        '[aria-roledescription="slide"][aria-hidden="false"]',
      );
      const target = (await activeSlide.count()) > 0 ? activeSlide : active;
      const file = path.join(OUT_DIR, `slide-${String(i + 1).padStart(2, "0")}.png`);
      await target.screenshot({ path: file });
      console.log(`  ✓ ${path.basename(file)}`);
    }

    await ctx.close();
  } finally {
    await browser.close();
  }
  console.log(`\nArtifacts in ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
