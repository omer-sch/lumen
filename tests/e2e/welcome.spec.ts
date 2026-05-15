import { test, expect } from "@playwright/test";
import { setupClerkTestingToken } from "@clerk/testing/playwright";

// /welcome is the post-sign-in landing experience. It branches on a single
// cookie (`lumen.welcomed.last`):
//   - missing  -> first-time cinematic (full hero + "pick a starting point")
//   - today's date -> instant router.replace("/dashboard"), no UI shown
//   - any other date -> "returning" light greeting + auto-advance
//
// Each test below clears that cookie up-front so it controls which branch
// renders. Without the clear, a previous run's cookie would silently turn
// the first-visit assertions into returning-mode assertions.

const COOKIE = "lumen.welcomed.last";
const todayISO = () => new Date().toISOString().slice(0, 10);

test.describe("welcome page (authenticated)", () => {
  test.beforeEach(async ({ page, context }) => {
    // Clerk's testing token has to be attached on every navigation that
    // exercises a signed-in route, even when storageState is in play —
    // it satisfies the rate-limit / dev-keys guard the SDK enforces.
    await setupClerkTestingToken({ page });
    await context.clearCookies();
  });

  // First sign-in shows the full cinematic — this is the brand moment.
  // If the destination grid disappears or the headline copy changes, the
  // first-impression UX is silently broken.
  test("first visit shows the cinematic with brand lockup and destinations", async ({
    page,
  }) => {
    await page.goto("/welcome");

    // Brand lockup is the "Lumen" wordmark in the cinematic header. The
    // welcome page renders its own header (not the app TopBar) so this
    // also acts as a guard that we landed on /welcome, not /dashboard.
    await expect(page.getByRole("main")).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 1, name: /Hi, I.?m Lumen\./i }),
    ).toBeVisible();
    await expect(
      page.getByText(/Your AI lens on yellowHEAD performance\./i),
    ).toBeVisible();

    // Destinations grid only appears in first-time mode and only after the
    // finale scene fires. Each destination link is what gives the user
    // somewhere to go after the intro.
    await expect(page.getByRole("link", { name: /Open Dashboard/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Open Ask/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Open Feed/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Open Knowledge/i })).toBeVisible();

    // The cookie must be set after the cinematic plays once — otherwise
    // every reload would re-play the full intro on the same day.
    const cookies = await page.context().cookies();
    const c = cookies.find((x) => x.name === COOKIE);
    expect(c?.value).toBe(todayISO());
  });

  // Same-day reload must redirect away — never re-play the cinematic.
  // This is what keeps /welcome from feeling like a tax on every visit.
  test("same-day repeat visit redirects straight to /dashboard", async ({
    page,
    context,
  }) => {
    await context.addCookies([
      {
        name: COOKIE,
        value: todayISO(),
        domain: "localhost",
        path: "/",
        sameSite: "Lax",
      },
    ]);

    await page.goto("/welcome");
    await expect(page).toHaveURL(/\/dashboard/);
  });

  // Returning users (cookie present, different date) get the light
  // greeting — the brand bulb + "Welcome back." + the dismiss hint.
  // No destination grid, no full hero copy.
  test("repeat visit on a new day shows the light greeting", async ({
    page,
    context,
  }) => {
    // A date deliberately far in the past — definitely not today.
    await context.addCookies([
      {
        name: COOKIE,
        value: "2000-01-01",
        domain: "localhost",
        path: "/",
        sameSite: "Lax",
      },
    ]);

    await page.goto("/welcome");

    await expect(
      page.getByRole("heading", { level: 1, name: /Welcome back\./i }),
    ).toBeVisible();
    await expect(page.getByText(/Click anywhere to continue/i)).toBeVisible();

    // Destinations grid is hidden in returning mode — guard against a
    // regression that accidentally re-renders the full first-time UX.
    await expect(
      page.getByRole("link", { name: /Open Dashboard/i }),
    ).toHaveCount(0);
  });
});
