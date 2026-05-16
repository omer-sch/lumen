/**
 * probe-smart-reports.mjs
 *
 * Playwright end-to-end probe: sign in as the test user, navigate to
 * /reports, type a prompt + action notes, click Generate, then inspect
 * the resulting Report DOM for prose blocks + `<> AI:` action callouts
 * in BOTH the document view AND the carousel view.
 *
 * Output:
 *   tmp/smart-reports-probe.txt   structured findings (counts + selectors)
 *   tmp/smart-reports-probe-*.png screenshots of doc + carousel
 *
 * Run: node scripts/probe-smart-reports.mjs
 */

import { chromium } from "@playwright/test";
import * as path from "node:path";
import * as fs from "node:fs/promises";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3000";
const REPO_ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const STORAGE_STATE = path.join(REPO_ROOT, "tests", ".auth", "user.json");
const OUT_DIR = path.join(REPO_ROOT, "tmp");

await fs.mkdir(OUT_DIR, { recursive: true });

const lines = [];
const log = (s) => {
  console.log(s);
  lines.push(s);
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  storageState: STORAGE_STATE,
  viewport: { width: 1440, height: 900 },
});
// Capture browser console messages so JS errors surface in stdout.
context.on("page", (p) => {
  p.on("console", (msg) => {
    if (msg.type() === "error" || msg.type() === "warning") {
      console.log(`[browser ${msg.type()}] ${msg.text()}`);
    }
  });
  p.on("pageerror", (err) => {
    console.log(`[pageerror] ${err.message}`);
  });
});

const page = await context.newPage();

// Pre-seed welcome cookie so we don't get redirected.
await page.context().addCookies([
  {
    name: "lumen.welcomed.last",
    value: new Date().toISOString().slice(0, 10),
    url: BASE_URL,
    sameSite: "Lax",
  },
]);

log("=== Loading /reports ===");
await page.goto(`${BASE_URL}/reports`, { waitUntil: "domcontentloaded" });
await page.waitForLoadState("networkidle").catch(() => {});
await page.waitForTimeout(2000);

const url = page.url();
log(`Landed at ${url}`);
const title = await page.title();
log(`Title: ${title}`);

// Find the prompt input and the action items textarea.
const promptInput = page.locator('textarea[id="report-prompt"]');
const promptVisible = await promptInput.isVisible().catch(() => false);
log(`prompt input visible: ${promptVisible}`);

const actionInput = page.locator('textarea[id="action-items-input"]');
const actionVisible = await actionInput.isVisible().catch(() => false);
log(`action input visible: ${actionVisible}`);

if (!promptVisible) {
  await page.screenshot({ path: path.join(OUT_DIR, "smart-reports-probe-no-prompt.png"), fullPage: true });
  log("FAILED: no prompt input on /reports. Snapshot saved.");
  await browser.close();
  await fs.writeFile(path.join(OUT_DIR, "smart-reports-probe.txt"), lines.join("\n"));
  process.exit(1);
}

await promptInput.fill(
  "Weekly UA performance summary for GlobalComix, Android Meta, last 7 days. Highlight any campaigns that need attention.",
);
if (actionVisible) {
  await actionInput.fill(
    "We added fresh creatives to the Sub Evergreen WW-Top campaign.\nWe paused the SubStart Evergreen India campaign.",
  );
}

log("=== Clicking Generate ===");
const generateBtn = page.getByRole("button", { name: /^Generate/i }).first();
const btnVisible = await generateBtn.isVisible().catch(() => false);
log(`Generate button visible: ${btnVisible}`);
await generateBtn.click({ timeout: 5000 }).catch((e) => log(`Generate click failed: ${e.message}`));

log("Waiting up to 60s for the report to render...");
const reportRoot = page.locator('[data-report-doc]');
const docOk = await reportRoot.waitFor({ timeout: 60000 }).then(() => true).catch(() => false);
log(`Report document rendered: ${docOk}`);

if (!docOk) {
  await page.screenshot({ path: path.join(OUT_DIR, "smart-reports-probe-no-doc.png"), fullPage: true });
  log("FAILED: document never rendered. Snapshot saved.");
  await browser.close();
  await fs.writeFile(path.join(OUT_DIR, "smart-reports-probe.txt"), lines.join("\n"));
  process.exit(1);
}

await page.waitForTimeout(2000);

// === Inspect DOCUMENT view ===
log("=== DOC VIEW INSPECTION ===");
const docHtml = await reportRoot.innerHTML();
// Count <mark> highlight pills (from ProseBlockView).
const docMarkCount = (docHtml.match(/<mark/g) ?? []).length;
log(`<mark> highlight tags in doc: ${docMarkCount}`);
// Count `<> AI` action pills.
const docActionPills = (docHtml.match(/&lt;&gt; AI|<\s*>\s*AI|&gt;\s*AI/g) ?? []).length;
log(`<> AI action pills (raw): ${docActionPills}`);
// Count action paragraphs by scanning for the pill text.
const proseHeadings = await page.locator('[data-report-doc] mark').count().catch(() => 0);
log(`<mark> elements (via locator): ${proseHeadings}`);

// Look for the literal "<> AI" string rendered in the page.
const aiPillCount = await page.locator('[data-report-doc]').getByText("<> AI", { exact: true }).count().catch(() => 0);
log(`"<> AI" text occurrences in doc: ${aiPillCount}`);

// Look for prose block containers (heading + p with <mark>).
const proseBlockCount = await page.locator('[data-report-doc] p.font-body').count().catch(() => 0);
log(`<p class~="font-body"> in doc: ${proseBlockCount}`);

await page.screenshot({ path: path.join(OUT_DIR, "smart-reports-probe-doc.png"), fullPage: true });
log("Saved smart-reports-probe-doc.png");

// === Switch to CAROUSEL view ===
log("=== CAROUSEL VIEW INSPECTION ===");
// The view toggle button text varies; try Carousel / Slides.
const carouselBtn = page.getByRole("button", { name: /Carousel|Slides|Cards/i }).first();
const carBtnOk = await carouselBtn.isVisible().catch(() => false);
log(`Carousel toggle visible: ${carBtnOk}`);
if (carBtnOk) {
  await carouselBtn.click().catch(() => {});
  await page.waitForTimeout(1500);
}

// Scan the whole page for AI pills + mark tags in carousel mode.
const carAiPills = await page.getByText("<> AI", { exact: true }).count().catch(() => 0);
log(`"<> AI" text occurrences in carousel: ${carAiPills}`);
const carMarks = await page.locator("mark").count().catch(() => 0);
log(`<mark> elements in carousel: ${carMarks}`);

await page.screenshot({ path: path.join(OUT_DIR, "smart-reports-probe-carousel-1.png"), fullPage: false });
log("Saved smart-reports-probe-carousel-1.png (first slide visible)");

// Click "next" a few times to scan multiple slides.
for (let i = 0; i < 8; i++) {
  const nextBtn = page.getByRole("button", { name: /Next|→/ }).first();
  const has = await nextBtn.isVisible().catch(() => false);
  if (!has) break;
  await nextBtn.click().catch(() => {});
  await page.waitForTimeout(500);
  const ap = await page.getByText("<> AI", { exact: true }).count().catch(() => 0);
  log(`slide ${i + 2}: <> AI count = ${ap}`);
  await page.screenshot({ path: path.join(OUT_DIR, `smart-reports-probe-carousel-${i + 2}.png`) }).catch(() => {});
}

await browser.close();
await fs.writeFile(path.join(OUT_DIR, "smart-reports-probe.txt"), lines.join("\n"));
log("Done.");
