// Lumen brand audit v3 — second pass, after fixes
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const OUT = '/tmp/lumen-audit-v3';
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
      await page.goto(`${BASE}${p.path}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForLoadState('load', { timeout: 10000 }).catch(() => {});
    } catch (e) {
      console.warn(`Goto error for ${key}: ${e.message}`);
    }
    await page.waitForTimeout(900);

    const fullPath = path.join(OUT, `${key}.png`);
    await page.screenshot({ path: fullPath, fullPage: true });

    const dom = await page.evaluate(() => {
      const get = (sel) => Array.from(document.querySelectorAll(sel));
      const summarise = (els, n = 8) => els.slice(0, n).map((el) => ({
        tag: el.tagName.toLowerCase(),
        cls: (el.getAttribute('class') || '').slice(0, 220),
        text: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 100),
      }));

      // Color counters: walk inline styles + computed for spot colors
      const yellowHits = [];
      const mintHits = [];
      const coralHits = [];
      const violetHits = [];
      const all = get('body *');
      const sample = all.slice(0, 1500);
      for (const el of sample) {
        const cs = getComputedStyle(el);
        const stack = [cs.color, cs.backgroundColor, cs.borderColor, cs.fill];
        for (const c of stack) {
          if (!c) continue;
          if (/255,\s*221,\s*12/.test(c) || /#FFDD0C/i.test(c)) yellowHits.push(el.tagName);
          if (/84,\s*240,\s*163/.test(c)) mintHits.push(el.tagName);
          if (/248,\s*134,\s*115/.test(c)) coralHits.push(el.tagName);
          if (/146,\s*111,\s*222/.test(c)) violetHits.push(el.tagName);
        }
      }

      // Mobile clip detection: any element where scrollWidth > clientWidth + 4 inside viewport
      const overflowing = [];
      for (const el of all) {
        if (el.scrollWidth > el.clientWidth + 4 && el.clientWidth > 0) {
          overflowing.push({
            tag: el.tagName.toLowerCase(),
            cls: (el.getAttribute('class') || '').slice(0, 120),
            sw: el.scrollWidth,
            cw: el.clientWidth,
          });
          if (overflowing.length > 6) break;
        }
      }

      return {
        title: document.title,
        h1: get('h1').map((e) => e.textContent?.trim().slice(0, 140)),
        h2: get('h2').map((e) => e.textContent?.trim().slice(0, 140)),
        gradients: summarise(get('[class*="gradient"], [class*="text-gradient"]')),
        glassCandidates: summarise(get('[class*="backdrop-blur"], [class*="glass"]')),
        pulseDots: summarise(get('[class*="pulse"], [class*="animate-pulse"]')),
        ambientBlobs: summarise(get('[class*="blur-3xl"], [class*="blur-2xl"]')),
        bodyBg: getComputedStyle(document.body).backgroundColor,
        fontBody: getComputedStyle(document.body).fontFamily,
        domTotal: all.length,
        colorHits: {
          yellow: yellowHits.length,
          mint: mintHits.length,
          coral: coralHits.length,
          violet: violetHits.length,
        },
        overflowing,
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        scrollHeight: document.documentElement.scrollHeight,
      };
    });
    report[key] = dom;
  }
  await ctx.close();
}

await browser.close();
await fs.writeFile(path.join(OUT, 'dom-report.json'), JSON.stringify(report, null, 2));
console.log('done. screenshots in', OUT);
