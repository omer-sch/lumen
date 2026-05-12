/**
 * One-shot verifier: sign in via @clerk/testing, hit the DB-backed
 * routes as the real Clerk user, and report what came back. Used to
 * prove the auth-bridge + data access layer work end-to-end against a
 * non-preview dev server (LUMEN_PREVIEW must NOT be set, so the
 * middleware enforces Clerk).
 *
 * Run with:
 *   npx tsx scripts/verify-signed-in.ts
 *
 * Env required (read from .env.local automatically):
 *   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY,
 *   E2E_CLERK_USER_EMAIL, E2E_CLERK_USER_PASSWORD
 */
import { config as loadDotenv } from "dotenv";
// dotenv's auto-config only reads `.env`. Next.js's convention puts
// secrets in `.env.local`; pick that up explicitly.
loadDotenv({ path: ".env.local" });

import { chromium } from "@playwright/test";
import {
  clerk,
  clerkSetup,
  setupClerkTestingToken,
} from "@clerk/testing/playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";

function need(k: string): string {
  const v = process.env[k];
  if (!v) throw new Error(`Missing env var: ${k}`);
  return v;
}

async function main() {
  // dotenv picks up .env.local automatically when imported as "dotenv/config".
  // Belt-and-braces: also surface what we found so the script is debuggable.
  console.log("[verify] base:", BASE);
  console.log("[verify] user:", need("E2E_CLERK_USER_EMAIL"));

  await clerkSetup();

  const browser = await chromium.launch();
  const page = await browser.newPage({ baseURL: BASE });

  // Log every Clerk API response so we can see whether the sign-in
  // attempt actually returned an error.
  page.on("response", async (r) => {
    const url = r.url();
    if (url.includes("clerk.accounts.dev") || url.includes("clerk.com")) {
      if (url.includes("/client/sign_ins") || url.includes("/touch")) {
        try {
          const body = (await r.text()).slice(0, 400);
          console.log(`[clerk] ${r.status()} ${url.slice(0, 80)} :: ${body}`);
        } catch {
          /* response may already be consumed */
        }
      }
    }
  });

  try {
    // Inject the per-page Clerk testing token so the bot/captcha
    // defences let our scripted sign-in through. Required when not
    // using Playwright's fixture-based context.
    await setupClerkTestingToken({ page });

    await page.goto("/sign-in");
    await clerk.signIn({
      page,
      signInParams: {
        strategy: "password",
        identifier: need("E2E_CLERK_USER_EMAIL"),
        password: need("E2E_CLERK_USER_PASSWORD"),
      },
    });

    const cookies = await page.context().cookies();
    const clerkCookies = cookies.filter((c) => c.name.startsWith("__"));
    console.log(
      "[verify] cookies after signIn:",
      clerkCookies.map((c) => `${c.name}=${c.value.slice(0, 16)}`).join(", ") ||
        "(none)",
    );
    await page.screenshot({ path: "/tmp/after-signin.png", fullPage: false });
    console.log("[verify] screenshot → /tmp/after-signin.png");
    // Also surface any visible Clerk error text.
    const bodyText = (await page.locator("body").innerText()).slice(0, 800);
    console.log("[verify] page body (first 800 chars):\n" + bodyText);

    // Land on /dashboard to settle the post-auth redirect.
    // Use 'load' instead of 'networkidle' — PostHog / Sentry keep the
    // network warm and 'networkidle' never fires in dev.
    await page.goto("/dashboard", { waitUntil: "load" });
    console.log("[verify] post-auth URL:", page.url());

    // /agents — DB-backed server component. Should respond 200 with
    // real run UUIDs in the HTML, not mock string IDs.
    const agentsRes = await page.request.get("/agents");
    const agentsHtml = await agentsRes.text();
    const uuidHits = agentsHtml.match(/11111111-1111-1111-1111-[0-9a-f]+/g) ?? [];
    const mockHits = agentsHtml.match(/aria-run-[0-9]+/g) ?? [];
    console.log(
      `[verify] /agents → HTTP ${agentsRes.status()} · ${agentsHtml.length} bytes ·`,
      `${uuidHits.length} DB UUIDs · ${mockHits.length} mock IDs`,
    );

    // /api/agents/aria/memory — strict DB read, scoped by Clerk userId.
    const memoryBefore = await page.request
      .get("/api/agents/aria/memory")
      .then((r) => r.json());
    console.log(
      "[verify] memory before:",
      Array.isArray(memoryBefore.entries) ? memoryBefore.entries.length : "?",
      "entries",
    );

    // POST a fresh feedback row tied to Aria run 1 (the seeded May 09).
    const post = await page.request.post("/api/agents/aria/memory", {
      data: {
        runId: "11111111-1111-1111-1111-000000000001",
        thumbs: "up",
        note: "verify-signed-in script · " + new Date().toISOString(),
        score: 88,
        date: "May 09",
      },
    });
    console.log("[verify] POST memory:", post.status(), await post.json());

    const memoryAfter = await page.request
      .get("/api/agents/aria/memory")
      .then((r) => r.json());
    console.log(
      "[verify] memory after:",
      Array.isArray(memoryAfter.entries) ? memoryAfter.entries.length : "?",
      "entries",
    );

    if (Array.isArray(memoryAfter.entries) && memoryAfter.entries.length > 0) {
      console.log(
        "[verify] newest entry:",
        memoryAfter.entries[memoryAfter.entries.length - 1],
      );
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error("[verify] FAILED:", err);
  process.exit(1);
});
