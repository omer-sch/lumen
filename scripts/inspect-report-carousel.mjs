// Quick playwright sanity check after the layout-step fix. Generates a
// report, walks every slide in carousel mode, and emits:
//  - a PNG per slide
//  - an overflow report — for each slide, does the inner content's
//    scrollHeight exceed the slide frame's clientHeight?
//
// Output: /tmp/lumen-report-carousel/
//
// Run: BASE_URL=http://localhost:3000 node scripts/inspect-report-carousel.mjs

import path from "node:path";
import fs from "node:fs/promises";
import { chromium } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const STORAGE_STATE = path.join(REPO_ROOT, "tests", ".auth", "user.json");
const OUT_DIR = "/tmp/lumen-report-carousel";

const VIEWPORT = { width: 1440, height: 900 };

const SEED_PROMPT =
  "Weekly UA performance summary for the team review";

async function main() {
  await fs.mkdir(OUT_DIR, { recursive: true });
  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({
      viewport: VIEWPORT,
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

    // Warm /reports — the first hit compiles the route.
    await page.goto(`${BASE_URL}/reports`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);

    // Wipe persisted reports so the sidebar is empty and the builder shows.
    await page.evaluate(() => window.localStorage.removeItem("lumen.reports"));
    await page.goto(`${BASE_URL}/reports`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("textarea#report-prompt", { timeout: 15_000 });

    // Generate. pressSequentially keeps the React controlled-input state in
    // sync even if hydration finished mid-fill; we then wait for the submit
    // button to become enabled before clicking it.
    const textarea = page.locator("textarea#report-prompt");
    await textarea.click();
    await textarea.pressSequentially(SEED_PROMPT, { delay: 5 });
    const submit = page.getByRole("button", { name: /Generate report/ });
    await submit.waitFor({ state: "visible" });
    await page.waitForFunction(
      () => {
        const btn = Array.from(document.querySelectorAll("button")).find(
          (b) => /Generate report/.test(b.textContent ?? ""),
        );
        return btn && !btn.hasAttribute("disabled");
      },
      undefined,
      { timeout: 10_000 },
    );
    await submit.click();
    await page.waitForSelector(
      '[aria-roledescription="carousel"], article[data-report-doc]',
      { timeout: 15_000 },
    );
    await page.waitForTimeout(700);

    // Switch to carousel mode.
    const carouselTab = page.getByRole("tab", { name: "Carousel" });
    if (await carouselTab.count()) {
      await carouselTab.click();
      await page.waitForSelector('[aria-roledescription="carousel"]');
      await page.waitForTimeout(500);
    }

    const dots = page.getByRole("tablist", { name: "Slide navigation" }).getByRole("tab");
    const total = await dots.count();
    console.log(`\nReport has ${total} slides (cover + content).\n`);

    const summary = [];
    for (let i = 0; i < total; i++) {
      await dots.nth(i).click();
      await page.waitForTimeout(550);

      const file = path.join(OUT_DIR, `slide-${String(i).padStart(2, "0")}.png`);
      await page.screenshot({ path: file });

      // Measure the active slide's content vs. its frame.
      const measure = await page.evaluate(() => {
        const slides = Array.from(
          document.querySelectorAll('[aria-roledescription="slide"]'),
        );
        // Active slide is the one with aria-hidden="false".
        const active = slides.find((s) => s.getAttribute("aria-hidden") === "false")
          ?? slides.find((s) => !s.getAttribute("aria-hidden"));
        if (!active) return null;
        const inner = active.firstElementChild;
        const frameRect = active.getBoundingClientRect();
        const innerRect = inner?.getBoundingClientRect();
        return {
          frameW: Math.round(frameRect.width),
          frameH: Math.round(frameRect.height),
          contentH: inner ? inner.scrollHeight : 0,
          contentW: inner ? inner.scrollWidth : 0,
          innerVisibleH: innerRect ? Math.round(innerRect.height) : 0,
          ariaLabel: active.getAttribute("aria-label") ?? "(no label)",
        };
      });

      if (!measure) {
        console.log(`  slide ${i}: could not measure`);
        continue;
      }
      const overflowY = measure.contentH - measure.frameH;
      const overflowX = measure.contentW - measure.frameW;
      const tag = overflowY > 2 || overflowX > 2 ? "OVERFLOW" : "ok";
      console.log(
        `  slide ${String(i).padStart(2)} (${tag}): "${measure.ariaLabel}"\n` +
          `      frame ${measure.frameW}x${measure.frameH}` +
          `   content ${measure.contentW}x${measure.contentH}` +
          `   overflow x=${overflowX} y=${overflowY}`,
      );
      summary.push({ i, ...measure, overflowX, overflowY, file });
    }

    await fs.writeFile(
      path.join(OUT_DIR, "report.json"),
      JSON.stringify(summary, null, 2),
    );

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
