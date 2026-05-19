import { test, expect } from "@playwright/test";

// /campaigns is gated by Clerk — these specs need the authed storage state
// produced by tests/e2e/auth.setup.ts. The "chromium-authed" project wires
// it up; declaring it here keeps the file runnable on its own too.
test.use({ storageState: "tests/.auth/user.json" });

// The drill-down table is the daily workhorse for UA — every assertion below
// maps to something a real analyst does in /campaigns. Rendering, sorting,
// channel scoping, deep-linking, and the recent hover-arrow removal.

test.describe("/campaigns table", () => {
  test("renders the breakdown with one row per campaign and the seven canonical columns", async ({
    page,
  }) => {
    await page.goto("/campaigns");

    // Heading anchors us on the right page before we inspect the table.
    await expect(
      page.getByRole("heading", { name: "Campaigns", level: 2 }),
    ).toBeVisible();

    const table = page.getByTestId("campaigns-table");
    await expect(table).toBeVisible();

    // SEEDS in src/lib/mock/campaigns.ts has 12 entries. If a seed is added
    // the maintainer should bump this together with the data — drift here
    // is a real signal.
    const rows = table.locator("tbody tr");
    await expect(rows).toHaveCount(12);

    // Column headers — the seven sortable + the spark cell. Names come
    // straight from CampaignsTable's COLUMNS table.
    const headers = ["Campaign", "Channel", "Spend", "Installs", "CPI", "ROAS", "Δ ROAS", "7d trend"];
    for (const label of headers) {
      await expect(
        table.getByRole("columnheader", { name: label }),
      ).toBeVisible();
    }
  });

  test("each row carries Channel pill, formatted Spend / Installs / CPI / ROAS, Δ ROAS chip, and a sparkline", async ({
    page,
  }) => {
    await page.goto("/campaigns");

    // Pick a known seed by id — Meta_Promo_Q2 is the highest-weight Meta
    // entry and is always present regardless of sort/filter defaults.
    const row = page.getByTestId("campaign-row-meta-promo-q2");
    await expect(row).toBeVisible();

    // Channel pill renders the literal channel label.
    await expect(row).toContainText("Meta");

    // Money / count formats: "$<n>", "<n>", "$<n.nn>", "<n.nn>x".
    await expect(row).toContainText(/\$[\d,]+/); // spend
    await expect(row).toContainText(/\$\d+\.\d{2}/); // CPI
    await expect(row).toContainText(/\d+\.\d{2}x/); // ROAS

    // Δ ROAS chip is rendered as "<n.n>%" with an arrow icon. The percent
    // sign is the cheapest unique tell.
    await expect(row).toContainText(/\d+\.\d%/);

    // Recharts always paints an <svg> inside the sparkline cell. The cell
    // is the 8th and last <td> in the row.
    const sparkCell = row.locator("td").nth(7);
    await expect(sparkCell.locator("svg")).toBeVisible();
  });

  test("clicking a sortable header flips the sort direction", async ({ page }) => {
    await page.goto("/campaigns");

    const firstRowName = () =>
      page.getByTestId("campaigns-table").locator("tbody tr").first().getByRole("link").first().textContent();

    // Default sort is spend desc — capture the leader, then flip to asc by
    // clicking Spend twice (first click keeps desc state on a sortable
    // already active, second click flips). One click is enough to flip
    // because sort state's current key is "spend" and toggleSort flips it.
    const before = await firstRowName();
    expect(before).not.toBeNull();

    await page.getByTestId("sort-spend").click();
    // After flipping spend desc → asc, the leader changes (lowest-spend
    // campaign comes to the top — AppsFlyer is the lowest-share channel).
    await expect.poll(firstRowName).not.toBe(before);
  });

  test("global filter (date range + client) from the topbar carries through to the page", async ({
    page,
  }) => {
    // Deep-link the global state via URL — the topbar pickers write the
    // exact same params, so this exercises the same contract without
    // needing to drive the menus. Header reflects the chosen client +
    // window length, proving the global filter reached the view.
    await page.goto("/campaigns?range=7d&client=lumi-runner");

    await expect(page.getByText(/UA · Lumi Runner · last 7 days/i)).toBeVisible();

    // The deep-link href on each row preserves the query so the campaign
    // profile opens with the same filters.
    const link = page
      .getByTestId("campaign-row-meta-promo-q2")
      .getByRole("link", { name: /Open Meta_Promo_Q2/i });
    await expect(link).toHaveAttribute(
      "href",
      /\/campaigns\/meta-promo-q2\?.*range=7d.*client=lumi-runner/,
    );
  });

  test("each row links to its campaign profile via an aria-labelled name link", async ({
    page,
  }) => {
    await page.goto("/campaigns");

    const link = page
      .getByTestId("campaign-row-g-uac-search")
      .getByRole("link", { name: /Open G_UAC_Search/i });

    await expect(link).toHaveAttribute("href", /\/campaigns\/g-uac-search/);
  });

  test("hovering a row does NOT add an arrow indicator (per the recent commit dropping the hover arrow)", async ({
    page,
  }) => {
    await page.goto("/campaigns");

    const row = page.getByTestId("campaign-row-meta-promo-q2");
    const link = row.getByRole("link", { name: /Open Meta_Promo_Q2/i });

    // The old layout rendered an ArrowUpRight icon inside the link with
    // `inline-flex items-center gap-1.5`. After the cleanup the link must
    // hold ONLY the campaign name — no SVG child, no flex layout, no
    // sibling chevron — both at rest and on hover.
    await expect(link.locator("svg")).toHaveCount(0);
    await link.hover();
    await expect(link.locator("svg")).toHaveCount(0);

    // Belt + braces: the link's class list should not contain the
    // inline-flex layout the old arrow variant required.
    const cls = (await link.getAttribute("class")) ?? "";
    expect(cls).not.toContain("inline-flex");
  });
});
