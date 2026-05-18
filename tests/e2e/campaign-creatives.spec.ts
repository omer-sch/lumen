import { test, expect } from "@playwright/test";

// /campaigns/creatives — Creative Breakdown view. Per-ad drilldown that
// sits beside the per-campaign profile under the Campaigns top-level
// page. Auth-gated like every other (app)/* route.
test.use({ storageState: "tests/.auth/user.json" });

test.describe("/campaigns/creatives", () => {
  test("loads with the header, back-link, and the filter chip row", async ({
    page,
  }) => {
    await page.goto("/campaigns/creatives");

    await expect(
      page.getByRole("heading", { name: /Creative Breakdown/i, level: 2 }),
    ).toBeVisible();

    const back = page.getByTestId("creative-breakdown-back-link");
    await expect(back).toBeVisible();
    await expect(back).toHaveAttribute("href", /\/campaigns/);

    // Filter chip row mounts even when rows are empty (chips read from
    // the row set, but the wrapper always renders). The placeholder
    // chips (ad status, country) live alongside the wired chips.
    await expect(page.getByTestId("chip-campaign-toggle")).toBeVisible();
    await expect(page.getByTestId("chip-ad-name-input")).toBeVisible();
  });

  test("back-link preserves the global filter state across navigation", async ({
    page,
  }) => {
    // Arrive with non-default filters so we can prove the breadcrumb
    // round-trips them. CreativeBreakdownView builds the back href from
    // window.location.search at render time, same shape as the
    // per-campaign profile breadcrumb.
    await page.goto("/campaigns/creatives?range=7d&client=globalcomix");
    const back = page.getByTestId("creative-breakdown-back-link");
    await expect(back).toHaveAttribute(
      "href",
      /\/campaigns\?.*range=7d.*client=globalcomix/,
    );
    await back.click();
    await expect(page).toHaveURL(/\/campaigns\?.*range=7d.*client=globalcomix/);
  });
});
