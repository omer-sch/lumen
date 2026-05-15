// Validates the PPTX export and captures off-screen deck slides for visual QA.
//
// Two artifacts land in OUT_DIR:
//   1. fixed-export.pptx — the actual PPTX produced by the running app.
//   2. deck-slide-NN.png — each slide of the off-screen renderer
//      (`ReportDeckOffscreen`) at 1600x900. The off-screen renderer walks the
//      same layoutSlides() output as export-pptx.ts, so these PNGs are the
//      closest visual stand-in for the rendered PPTX without a local PPTX
//      renderer (soffice / Keynote / PowerPoint).
//
// Run: BASE_URL=http://localhost:3000 node scripts/inspect-pptx-and-deck.mjs

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
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
      storageState: STORAGE_STATE,
      acceptDownloads: true,
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

    // Warm /reports.
    await page.goto(`${BASE_URL}/reports`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);

    await page.evaluate(() => window.localStorage.removeItem("lumen.reports"));
    await page.goto(`${BASE_URL}/reports`, { waitUntil: "domcontentloaded" });
    await page.waitForSelector("textarea#report-prompt", { timeout: 15_000 });

    // Generate report.
    const textarea = page.locator("textarea#report-prompt");
    await textarea.click();
    await textarea.pressSequentially(SEED_PROMPT, { delay: 5 });
    const submit = page.getByRole("button", { name: /Generate report/ });
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
    await submit.click();
    await page.waitForSelector(
      '[aria-roledescription="carousel"], article[data-report-doc]',
      { timeout: 15_000 },
    );
    await page.waitForTimeout(700);

    // ---- 1. Trigger PPTX download ----
    console.log("Triggering PPTX download...");
    const downloadPromise = page.waitForEvent("download", { timeout: 30_000 });
    await page.getByRole("button", { name: /^PPTX$/ }).click();
    const download = await downloadPromise;
    const pptxPath = path.join(OUT_DIR, "fixed-export.pptx");
    await download.saveAs(pptxPath);
    const stat = await fs.stat(pptxPath);
    console.log(`  ✓ ${pptxPath} (${stat.size} bytes)`);

    // ---- 2. Capture off-screen deck slides ----
    // ReportDeckOffscreen mounts at -100000px when the carousel view is
    // active during PDF capture. We mount it on demand by triggering the
    // PDF capture button (which is the same flow).
    //
    // Simpler: navigate to the page with a flag that forces the off-screen
    // deck to mount. ReportsView mounts it when generating PDF. We'll
    // mount it manually via evaluate.
    console.log("Capturing off-screen deck slides...");
    // Force the off-screen deck to mount by clicking PDF (which captures
    // each slide individually; we intercept).
    // Simpler: poke the DOM to make any data-deck-slide elements visible.

    // The off-screen deck is mounted whenever ReportsView decides to. Let's
    // simulate the PDF export trigger but cancel — actually the PDF flow
    // mounts the deck just-in-time. Let me check by going via a different
    // route: navigate to ?dump=1 if there were such a flag, but there
    // isn't. So we'll inject a mount by manipulating the page.
    //
    // Approach: scroll to the deck root after clicking the PDF button,
    // capture each [data-deck-slide], then cancel the PDF if it actually
    // tries to download.
    const downloadHandler = (d) => d.cancel().catch(() => {});
    page.on("download", downloadHandler);

    await page.getByRole("button", { name: /^PDF$/ }).click();
    // Wait for the off-screen deck to mount.
    await page
      .waitForSelector("[data-deck-slide]", { timeout: 15_000 })
      .catch(() => {});

    const slideCount = await page.locator("[data-deck-slide]").count();
    console.log(`  ${slideCount} off-screen slides mounted`);

    if (slideCount === 0) {
      console.warn(
        "  ⚠ no off-screen slides found; the PDF capture might have already finished.",
      );
    } else {
      // Capture all slides into a single dataURL list before the PDF
      // flow unmounts the off-screen deck. html2canvas inside the page
      // grabs the same DOM the PPTX would walk in spirit (both walk
      // layoutSlides). Capturing inside one evaluate keeps everything
      // happening before the deck unmounts.
      await page.evaluate(() => {
        const root = document.querySelector("[data-deck-root]");
        if (root instanceof HTMLElement) {
          root.style.top = "0";
          root.style.left = "0";
          root.style.zIndex = "9999";
        }
      });
      await page.setViewportSize({ width: 1600, height: 900 });
      await page.waitForTimeout(200);

      const elementHandles = await page.locator("[data-deck-slide]").elementHandles();
      console.log(`  capturing ${elementHandles.length} slides...`);
      const captures = [];
      for (let i = 0; i < elementHandles.length; i++) {
        try {
          const buf = await elementHandles[i].screenshot();
          captures.push(buf);
        } catch (err) {
          console.warn(`  ⚠ slide ${i + 1} screenshot failed: ${err.message}`);
        }
      }
      for (let i = 0; i < captures.length; i++) {
        const file = path.join(
          OUT_DIR,
          `deck-slide-${String(i + 1).padStart(2, "0")}.png`,
        );
        await fs.writeFile(file, captures[i]);
        console.log(`  ✓ ${path.basename(file)}`);
      }
    }
    page.off("download", downloadHandler);

    await ctx.close();
  } finally {
    await browser.close();
  }
  console.log(`\nDone. Artifacts in ${OUT_DIR}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
