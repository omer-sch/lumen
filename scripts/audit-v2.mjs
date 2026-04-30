// Lumen brand audit v2 — captures desktop + mobile screenshots and DOM snapshots
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const OUT = '/tmp/lumen-audit-v2';
const BASE = 'http://localhost:3001';

const PAGES = [
  { name: 'sign-in',   path: '/sign-in' },
  { name: 'sign-up',   path: '/sign-up' },
  { name: 'dashboard', path: '/dashboard' },
  { name: 'queries',   path: '/queries' },
  { name: 'feed',      path: '/feed' },
  { name: 'knowledge', path: '/knowledge' },
];

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile',  width: 375,  height: 812 },
];

await fs.mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const report = {};

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 2,
  });
  const page = await ctx.newPage();

  for (const p of PAGES) {
    const key = `${p.name}-${vp.name}`;
    console.log(`Capturing ${key}...`);
    try {
      await page.goto(`${BASE}${p.path}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForLoadState('load', { timeout: 8000 }).catch(() => {});
    } catch (e) {
      console.warn(`Goto error for ${key}: ${e.message}`);
    }
    // Give animations a moment
    await page.waitForTimeout(800);

    const fullPath = path.join(OUT, `${key}.png`);
    await page.screenshot({ path: fullPath, fullPage: true });

    // Pull a small DOM snapshot — look for glass cards, gradient text, ambient blobs, pulse dots
    const dom = await page.evaluate(() => {
      const get = (sel) => Array.from(document.querySelectorAll(sel));
      const summarise = (els, n = 6) => els.slice(0, n).map((el) => ({
        tag: el.tagName.toLowerCase(),
        cls: (el.getAttribute('class') || '').slice(0, 200),
        text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 90),
      }));
      return {
        title: document.title,
        h1: get('h1').map((e) => e.textContent?.trim().slice(0, 120)),
        h2: get('h2').map((e) => e.textContent?.trim().slice(0, 120)),
        gradients: summarise(get('[class*="gradient"], [class*="text-gradient"]')),
        glassCandidates: summarise(get('[class*="backdrop-blur"], [class*="glass"]')),
        pulseDots: summarise(get('[class*="pulse"]')),
        ambientBlobs: summarise(get('[class*="blur-3xl"], [class*="blur-2xl"]')),
        bodyBg: getComputedStyle(document.body).backgroundColor,
        fontBody: getComputedStyle(document.body).fontFamily,
        // count yellow vs mint vs coral colored elements (rough)
        sample: get('body *').length,
      };
    });
    report[key] = dom;
  }
  await ctx.close();
}

await browser.close();
await fs.writeFile(path.join(OUT, 'dom-report.json'), JSON.stringify(report, null, 2));
console.log('done. screenshots in', OUT);
