// One-off diagnostic spec: visit /dashboard in preview mode, screenshot
// every viewport size, dump console errors, and probe each new WS6/WS7
// surface. Goal is honest evidence about what actually renders, NOT
// pass/fail gating. Every probe is wrapped in test.step so a missing
// element doesn't abort the rest of the scan.

import { test, expect } from "@playwright/test";
import { writeFileSync } from "node:fs";
import path from "node:path";

const OUT_DIR = path.join(process.cwd(), "test-results", "dashboard-scan");

test.describe("dashboard scan (preview mode)", () => {
  test("full dashboard scan", async ({ page }) => {
    test.setTimeout(120_000);

    const consoleMessages: { type: string; text: string }[] = [];
    const pageErrors: string[] = [];
    const failedRequests: { url: string; status: number; error?: string }[] = [];

    page.on("console", (msg) => {
      consoleMessages.push({ type: msg.type(), text: msg.text() });
    });
    page.on("pageerror", (err) => {
      pageErrors.push(err.message);
    });
    page.on("requestfailed", (req) => {
      failedRequests.push({
        url: req.url(),
        status: 0,
        error: req.failure()?.errorText ?? "unknown",
      });
    });
    page.on("response", (res) => {
      if (res.status() >= 400 && res.url().includes("/api/")) {
        failedRequests.push({ url: res.url(), status: res.status() });
      }
    });

    await page.goto("/dashboard", { waitUntil: "networkidle" });

    // Top-level: screenshot the page at 1440x900 (the default Looker viewport).
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(800); // let post-load network settle
    await page.screenshot({
      path: path.join(OUT_DIR, "01-default-1440.png"),
      fullPage: true,
    });

    // Probe each new surface. Each probe records presence + visibility.
    const probes: Record<string, { present: boolean; visible?: boolean; text?: string }> = {};

    async function probe(name: string, locator: ReturnType<typeof page.locator>) {
      const count = await locator.count();
      const present = count > 0;
      let visible: boolean | undefined;
      let text: string | undefined;
      if (present) {
        try {
          visible = await locator.first().isVisible();
          text = ((await locator.first().textContent()) ?? "").trim().slice(0, 200);
        } catch {
          /* swallow — diagnostic */
        }
      }
      probes[name] = { present, visible, text };
    }

    await test.step("WS6 — OS filter chip group", async () => {
      await probe("os-filter-group", page.getByRole("group", { name: /os filter/i }));
      for (const v of ["total", "ios", "android", "web"] as const) {
        await probe(`os-chip-${v}`, page.getByTestId(`os-filter-${v}`));
      }
    });

    await test.step("WS6 — Platform filter chip group", async () => {
      await probe("platform-filter-group", page.getByRole("group", { name: /platform filter/i }));
      for (const v of ["all", "meta", "google", "tiktok", "apple_search_ads", "applovin"] as const) {
        await probe(`platform-chip-${v}`, page.getByTestId(`platform-filter-${v}`));
      }
    });

    await test.step("WS7.E — Paid vs Organic / BCAC strip", async () => {
      await probe("paid-vs-organic-heading", page.getByRole("heading", { name: /paid vs organic/i }));
      await probe("bcac-tile", page.getByText(/BCAC/i).first());
    });

    await test.step("WS7.A — CadenceTable", async () => {
      await probe("cadence-heading", page.getByRole("heading", { name: /performance by cadence/i }));
      await probe("cadence-daily-toggle", page.getByRole("button", { name: "Daily", exact: true }));
      await probe("cadence-weekly-toggle", page.getByRole("button", { name: "Weekly", exact: true }));
      await probe("cadence-monthly-toggle", page.getByRole("button", { name: "Monthly", exact: true }));
    });

    await test.step("WS7.B — Weekends vs Weekdays", async () => {
      await probe("weekends-heading", page.getByRole("heading", { name: /weekends vs weekdays/i }));
    });

    await test.step("WS7.D — Subscriber lifecycle", async () => {
      await probe("lifecycle-heading", page.getByRole("heading", { name: /subscriber lifecycle/i }));
      await probe("lifecycle-new-subs", page.getByText(/New subscribers/i).first());
      await probe("lifecycle-net-sub", page.getByText(/Net Sub/i).first());
    });

    await test.step("Existing dashboard surfaces (regression check)", async () => {
      await probe("dashboard-mode-toggle", page.getByTestId("dashboard-mode-toggle"));
      await probe("trend-chart", page.getByTestId("trend-chart"));
      await probe("date-range-30d", page.getByTestId("date-range-30d"));
      await probe("client-selector", page.getByRole("button", { name: /globalcomix/i }));
    });

    await test.step("Filter URL behavior: click iOS chip, check URL", async () => {
      const iosChip = page.getByTestId("os-filter-ios");
      if (await iosChip.count() > 0) {
        await iosChip.click();
        await page.waitForTimeout(500);
        const url = page.url();
        probes["after-ios-click-url"] = { present: true, text: url };
        await page.screenshot({
          path: path.join(OUT_DIR, "02-os-ios-active.png"),
          fullPage: true,
        });
        // Reset
        const totalChip = page.getByTestId("os-filter-total");
        if (await totalChip.count() > 0) await totalChip.click();
      } else {
        probes["after-ios-click-url"] = { present: false };
      }
    });

    await test.step("Filter URL behavior: click Meta chip, check URL", async () => {
      const metaChip = page.getByTestId("platform-filter-meta");
      if (await metaChip.count() > 0) {
        await metaChip.click();
        await page.waitForTimeout(500);
        probes["after-meta-click-url"] = {
          present: true,
          text: page.url(),
        };
        await page.screenshot({
          path: path.join(OUT_DIR, "03-platform-meta-active.png"),
          fullPage: true,
        });
      } else {
        probes["after-meta-click-url"] = { present: false };
      }
    });

    // Final scrolled screenshot to see below-the-fold content.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);
    await page.screenshot({
      path: path.join(OUT_DIR, "04-scrolled-bottom.png"),
      fullPage: false,
    });

    // Write the diagnostic dump.
    const report = {
      url: page.url(),
      probes,
      consoleErrors: consoleMessages.filter((m) => m.type === "error"),
      consoleWarnings: consoleMessages
        .filter((m) => m.type === "warning")
        .slice(0, 20),
      pageErrors,
      failedRequests,
    };
    writeFileSync(
      path.join(OUT_DIR, "report.json"),
      JSON.stringify(report, null, 2),
    );

    // Not assertions — the scan succeeds by completing; the human reads
    // report.json + the screenshots to draw conclusions.
    expect(report).toBeDefined();
  });
});
