import { chromium } from "playwright";

const browser = await chromium.launch();

async function snap(url, file, viewport) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".cl-formButtonPrimary, .cl-card", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2500);
  await page.screenshot({ path: file, fullPage: true });
  // Spot-check key Clerk slots
  const probe = await page.evaluate(() => {
    const pick = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const cs = getComputedStyle(el);
      return {
        sel,
        text: el.textContent?.trim().slice(0, 40),
        color: cs.color,
        bg: cs.backgroundColor,
        radius: cs.borderRadius,
      };
    };
    return [
      pick(".cl-formFieldLabel"),
      pick(".cl-formFieldInput"),
      pick(".cl-formButtonPrimary"),
      pick(".cl-socialButtonsBlockButton"),
      pick(".cl-dividerText"),
      pick(".cl-footerActionText"),
    ].filter(Boolean);
  });
  await ctx.close();
  return probe;
}

const desk = { width: 1440, height: 900 };
const mob = { width: 375, height: 812 };

const out1 = await snap("http://localhost:3001/sign-in", "/tmp/lumen-audit/v2-desktop-sign-in.png", desk);
const out2 = await snap("http://localhost:3001/sign-up", "/tmp/lumen-audit/v2-desktop-sign-up.png", desk);
const out3 = await snap("http://localhost:3001/sign-in", "/tmp/lumen-audit/v2-mobile-sign-in.png", mob);

console.log("=== sign-in (desktop) ===");
console.log(JSON.stringify(out1, null, 2));
console.log("=== sign-up (desktop) ===");
console.log(JSON.stringify(out2, null, 2));

await browser.close();
