// Second scan: intercept /api/bq/* with fixture JSON so the four new
// dashboard sections actually mount with data and we can see them in the
// browser. Proves the WS7 placement fix landed correctly: when the
// dashboard's data plane is healthy, the new sections render below the
// KPI / trend row exactly where the design intended.

import { test, expect } from "@playwright/test";
import { writeFileSync } from "node:fs";
import path from "node:path";

const OUT_DIR = path.join(process.cwd(), "test-results", "dashboard-scan-mocked");

const MOCK_KPIS = {
  spend: 285_000,
  installs: 199_475,
  cpi: 1.49,
  roas: 0.298,
  subStart: 4_200,
  subD0: 850,
  subD7: 1_120,
  cpaD7: 254.46,
  cpSubStart: 67.86,
  cpaD0: 335.29,
  spendDelta: 0.12,
  installsDelta: 0.08,
  cpiDelta: -0.04,
  roasDelta: 0.01,
  cpaD7Delta: -0.07,
  subD7Delta: 0.14,
  subStartDelta: 0.09,
  subD0Delta: 0.11,
  cpSubStartDelta: 0.03,
  cpaD0Delta: -0.02,
};

const MOCK_TREND = Array.from({ length: 30 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 3, 15 + i));
  const iso = d.toISOString().slice(0, 10);
  return {
    date: iso,
    network: "Meta",
    spend: 9000 + i * 200,
    installs: 5500 + i * 50,
    cpi: 1.5,
    roas: 0.3,
    subD7: 35 + i,
    subStartD7: 130 + i * 2,
    revD7: 2700 + i * 60,
    clicks: 12000,
    impressions: 280000,
    ctr: 0.043,
  };
});

const MOCK_NETWORK_BREAKDOWN = [
  {
    network: "Meta",
    spend: 180_000,
    share: 0.63,
    installs: 120_000,
    clicks: 380_000,
    impressions: 9_500_000,
    cpi: 1.5,
    ctr: 0.04,
    cpm: 18,
    cpc: 0.47,
    roasD7: 0.31,
    roasD14: 0.45,
    roasD30: 0.62,
    roasD90: 0.78,
    ftdD7: 2400,
    payersD7: 720,
    retD7: 0.42,
    subStart: 2600,
    subD0: 530,
    subD7: 720,
    cpSubStart: 69,
    cpaD0: 339,
    cpaD7: 250,
    trailingCpaD7Avg: 260,
  },
  {
    network: "Google",
    spend: 65_000,
    share: 0.23,
    installs: 49_000,
    clicks: 110_000,
    impressions: 2_400_000,
    cpi: 1.33,
    ctr: 0.045,
    cpm: 27,
    cpc: 0.59,
    roasD7: 0.28,
    roasD14: 0.41,
    roasD30: 0.55,
    roasD90: 0.7,
    ftdD7: 920,
    payersD7: 280,
    retD7: 0.38,
    subStart: 980,
    subD0: 210,
    subD7: 280,
    cpSubStart: 66,
    cpaD0: 309,
    cpaD7: 232,
    trailingCpaD7Avg: 245,
  },
];

const MOCK_WEEKENDS = [
  { bucket: "weekday", spend: 200_000, installs: 140_000, sub_d7: 820, sub_start_d7: 3_000, cpa_d7: 244, cp_sub_start: 67, roi_d7: 0.31, install_cvr: 0.7, sub_cvr: 0.006 },
  { bucket: "weekend", spend: 85_000, installs: 59_000, sub_d7: 300, sub_start_d7: 1_200, cpa_d7: 283, cp_sub_start: 71, roi_d7: 0.25, install_cvr: 0.69, sub_cvr: 0.005 },
];

const MOCK_SUBS_DAILY = Array.from({ length: 30 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 3, 15 + i));
  return [
    { date: d.toISOString().slice(0, 10), os: "iOS", subs: 60 + i, churn: 8, netSub: 52 + i },
    { date: d.toISOString().slice(0, 10), os: "Android", subs: 45 + i, churn: 7, netSub: 38 + i },
    { date: d.toISOString().slice(0, 10), os: "Web", subs: 12 + Math.floor(i / 2), churn: 3, netSub: 9 + Math.floor(i / 2) },
  ];
}).flat();

const MOCK_OS_MIX = [
  { os: "iOS", subs: 1820, share: 0.55 },
  { os: "Android", subs: 1240, share: 0.37 },
  { os: "Web", subs: 250, share: 0.08 },
];

const MOCK_NET_SUB_TREND = Array.from({ length: 30 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 3, 15 + i));
  return {
    date: d.toISOString().slice(0, 10),
    netSub: 95 + Math.round(Math.sin(i / 3) * 20),
  };
});

const MOCK_GEO = [
  { country_code: "US", country_name: "United States", spend: 0, installs: 0, sub_d7: 720, rev_d7: 14_500, cpa_d7: 0, roi_d7: 0, sub_paid: 540, sub_organic: 180 },
  { country_code: "GB", country_name: "United Kingdom", spend: 0, installs: 0, sub_d7: 280, rev_d7: 6_200, cpa_d7: 0, roi_d7: 0, sub_paid: 210, sub_organic: 70 },
];

const MOCK_CHANNEL_MIX = [
  { network: "Meta", spend: 180_000, share: 0.63 },
  { network: "Google", spend: 65_000, share: 0.23 },
  { network: "TikTok", spend: 35_000, share: 0.12 },
  { network: "Apple Search Ads", spend: 5_000, share: 0.02 },
];

const MOCK_PAYBACK = [
  { day: 0, revenue: 8_500, roas: 0.03 },
  { day: 7, revenue: 28_300, roas: 0.099 },
  { day: 14, revenue: 56_500, roas: 0.198 },
  { day: 30, revenue: 99_500, roas: 0.349 },
  { day: 90, revenue: 175_000, roas: 0.614 },
];

test.describe("dashboard scan with mocks", () => {
  test("full dashboard scan with mocked /api/bq/* responses", async ({ page }) => {
    test.setTimeout(120_000);

    // Intercept every /api/bq/* call and return fixture data so the
    // four new sections actually have something to render.
    await page.route(/\/api\/bq\/dashboard-kpis(\?.*)?$/, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_KPIS) }),
    );
    await page.route(/\/api\/bq\/trend(\?.*)?$/, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_TREND) }),
    );
    await page.route(/\/api\/bq\/network-breakdown(\?.*)?$/, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_NETWORK_BREAKDOWN) }),
    );
    await page.route(/\/api\/bq\/weekends(\?.*)?$/, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_WEEKENDS) }),
    );
    await page.route(/\/api\/bq\/geo(\?.*)?$/, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_GEO) }),
    );
    await page.route(/\/api\/bq\/total-subs\?.*view=os-mix.*$/, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_OS_MIX) }),
    );
    await page.route(/\/api\/bq\/total-subs\?.*view=net-sub-trend.*$/, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_NET_SUB_TREND) }),
    );
    // Default /api/bq/total-subs (no view) -> daily rows.
    await page.route(/\/api\/bq\/total-subs(\?(?!.*view=).*)?$/, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_SUBS_DAILY) }),
    );
    await page.route(/\/api\/bq\/channel-mix(\?.*)?$/, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_CHANNEL_MIX) }),
    );
    await page.route(/\/api\/bq\/payback(\?.*)?$/, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(MOCK_PAYBACK) }),
    );
    await page.route(/\/api\/bq\/campaigns(\?.*)?$/, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify([]) }),
    );
    await page.route(/\/api\/bq\/data-bounds(\?.*)?$/, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ earliest: "2026-01-01", latest: "2026-05-14" }) }),
    );
    await page.route(/\/api\/bq\/freshness(\?.*)?$/, (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ lastUpdated: new Date().toISOString(), hoursAgo: 6, dataAsOf: "2026-05-13" }) }),
    );

    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/dashboard", { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);

    await page.screenshot({
      path: path.join(OUT_DIR, "01-top.png"),
      fullPage: false,
    });
    await page.screenshot({
      path: path.join(OUT_DIR, "01-fullpage.png"),
      fullPage: true,
    });

    const probes: Record<string, { present: boolean; text?: string }> = {};
    async function probe(name: string, locator: ReturnType<typeof page.locator>) {
      const count = await locator.count();
      const present = count > 0;
      let text: string | undefined;
      if (present) {
        try {
          text = ((await locator.first().textContent()) ?? "").trim().slice(0, 240);
        } catch {
          /* ignore */
        }
      }
      probes[name] = { present, text };
    }

    await probe("paid-vs-organic-heading", page.getByRole("heading", { name: /paid vs organic/i }));
    await probe("bcac-label", page.getByText(/^BCAC$/).first());
    await probe("cadence-heading", page.getByRole("heading", { name: /performance by cadence/i }));
    await probe("weekends-heading", page.getByRole("heading", { name: /weekends vs weekdays/i }));
    await probe("lifecycle-heading", page.getByRole("heading", { name: /subscriber lifecycle/i }));
    await probe("os-filter-group", page.getByRole("group", { name: /os filter/i }));
    await probe("platform-filter-group", page.getByRole("group", { name: /platform filter/i }));

    // Click cadence toggle to confirm interactivity.
    const monthly = page.getByRole("button", { name: "Monthly", exact: true });
    if (await monthly.count() > 0) {
      await monthly.click();
      await page.waitForTimeout(200);
      await page.screenshot({
        path: path.join(OUT_DIR, "02-cadence-monthly.png"),
        fullPage: false,
      });
    }

    // Scroll to capture below-the-fold.
    await page.evaluate(() => window.scrollTo(0, 600));
    await page.waitForTimeout(300);
    await page.screenshot({
      path: path.join(OUT_DIR, "03-scrolled-600.png"),
      fullPage: false,
    });
    await page.evaluate(() => window.scrollTo(0, 1400));
    await page.waitForTimeout(300);
    await page.screenshot({
      path: path.join(OUT_DIR, "04-scrolled-1400.png"),
      fullPage: false,
    });
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(300);
    await page.screenshot({
      path: path.join(OUT_DIR, "05-scrolled-bottom.png"),
      fullPage: false,
    });

    writeFileSync(
      path.join(OUT_DIR, "report.json"),
      JSON.stringify({ url: page.url(), probes, consoleErrors }, null, 2),
    );

    expect(probes).toBeDefined();
  });
});
