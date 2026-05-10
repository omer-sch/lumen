// Create a dedicated demo user in Clerk for the Playwright E2E suite.
//
// Run: node --env-file=.env.local scripts/create-e2e-user.mjs
//
// What it does:
// 1. Calls Clerk Backend API (https://api.clerk.com/v1/users) using
//    CLERK_SECRET_KEY from your .env.local. The secret never leaves your
//    machine.
// 2. Creates a user with a known username + password.
// 3. Marks the email address verified so Clerk lets the test sign in
//    immediately (test users skip the inbox round-trip).
// 4. Prints the two env-var lines to paste into .env.local so the
//    `chromium-authed` Playwright project can sign in.
//
// If the user already exists, this script reports that and exits 0 — safe to
// re-run. To rotate the password, delete the user in the Clerk dashboard
// first.

const SECRET = process.env.CLERK_SECRET_KEY;
if (!SECRET) {
  console.error("❌ CLERK_SECRET_KEY missing. Run with --env-file=.env.local");
  process.exit(1);
}
if (!SECRET.startsWith("sk_")) {
  console.error("❌ CLERK_SECRET_KEY does not look like a Clerk secret key (sk_…)");
  process.exit(1);
}

// Stable demo identity — easy to recognize in the Clerk dashboard.
const USERNAME = "lumen-e2e";
// IANA-reserved domain — Clerk accepts it and there's no real inbox to leak
// notifications to.
const EMAIL = "lumen-e2e@example.com";
// Strong static password — fine for a non-human test user that lives only
// in Clerk and only signs in from Playwright.
const PASSWORD = "Lumen-E2E-yH-2026-Stable!";

const API = "https://api.clerk.com/v1";
const headers = {
  Authorization: `Bearer ${SECRET}`,
  "Content-Type": "application/json",
};

async function findExisting() {
  const r = await fetch(`${API}/users?username=${USERNAME}`, { headers });
  if (!r.ok) return null;
  const list = await r.json();
  return Array.isArray(list) && list.length > 0 ? list[0] : null;
}

async function createUser() {
  const r = await fetch(`${API}/users`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      username: USERNAME,
      email_address: [EMAIL],
      password: PASSWORD,
      skip_password_checks: true,
      skip_password_requirement: false,
    }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) {
    throw new Error(
      `Clerk API ${r.status}: ${JSON.stringify(body, null, 2)}`,
    );
  }
  return body;
}

async function verifyEmail(userId, emailId) {
  // Mark email verified server-side so the user can sign in without an
  // inbox click. Backend-only — never exposed to the browser.
  const r = await fetch(`${API}/email_addresses/${emailId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ verified: true }),
  });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    console.warn(
      `⚠️  Could not auto-verify email (${r.status}). You may need to verify in the Clerk dashboard.\n` +
        JSON.stringify(body, null, 2),
    );
  }
}

function printEnvBlock() {
  console.log("\n" + "─".repeat(60));
  console.log("Add these two lines to .env.local:");
  console.log("─".repeat(60));
  console.log(`E2E_CLERK_USER_USERNAME=${USERNAME}`);
  console.log(`E2E_CLERK_USER_PASSWORD=${PASSWORD}`);
  console.log("─".repeat(60));
  console.log("Then run:  npm run test:e2e\n");
}

(async () => {
  console.log(`→ Looking up existing user "${USERNAME}"…`);
  const existing = await findExisting();
  if (existing) {
    console.log(`✅ User already exists (id: ${existing.id}). Reusing.`);
    printEnvBlock();
    return;
  }

  console.log(`→ Creating Clerk user ${EMAIL}…`);
  const user = await createUser();
  console.log(`✅ Created user id ${user.id}.`);

  const emailId = user.email_addresses?.[0]?.id;
  if (emailId) {
    console.log("→ Marking email verified…");
    await verifyEmail(user.id, emailId);
    console.log("✅ Verified.");
  }

  printEnvBlock();
})().catch((err) => {
  console.error("\n❌ Failed:", err.message);
  process.exit(1);
});
