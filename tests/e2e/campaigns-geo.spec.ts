import { test, expect } from "@playwright/test";

// /campaigns/geo — client-wide Geo drilldown. Sibling to
// /campaigns/creatives under the Campaigns top-level page. Auth-gated
// like every other (app)/* route.
test.use({ storageState: "tests/.auth/user.json" });

test.describe("/campaigns/geo", () => {
  test("loads with the header, back-link, and the three top-level sections", async ({
    page,
  }) => {
    await page.goto("/campaigns/geo");

    await expect(
      page.getByRole("heading", { name: /Geo Breakdown/i, level: 2 }),
    ).toBeVisible();

    const back = page.getByTestId("geo-breakdown-back-link");
    await expect(back).toBeVisible();
    await expect(back).toHaveAttribute("href", /\/campaigns/);

    // The three section testids the orchestrator wires up — donut +
    // choropleth + table. Skeleton swaps out as soon as the geo data
    // resolves; we wait for the table testid to settle since it's the
    // last section to render.
    await expect(page.getByTestId("geo-top-countries-donut")).toBeVisible();
    await expect(page.getByTestId("geo-choropleth-map")).toBeVisible();
    await expect(page.getByTestId("geo-country-table").or(
      page.getByTestId("geo-country-table-empty"),
    )).toBeVisible();
  });

  test("back-link preserves the global filter state across navigation", async ({
    page,
  }) => {
    await page.goto("/campaigns/geo?range=7d&client=globalcomix");
    const back = page.getByTestId("geo-breakdown-back-link");
    await expect(back).toHaveAttribute(
      "href",
      /\/campaigns\?.*range=7d.*client=globalcomix/,
    );
    await back.click();
    await expect(page).toHaveURL(/\/campaigns\?.*range=7d.*client=globalcomix/);
  });

  test("Phase-2 cost-side coverage warning renders on the page", async ({
    page,
  }) => {
    await page.goto("/campaigns/geo");
    await expect(page.getByTestId("geo-coverage-warning")).toBeVisible();
  });
});
