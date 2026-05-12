import "server-only";

import { auth } from "@clerk/nextjs/server";

/**
 * The placeholder id used in PREVIEW mode (LUMEN_PREVIEW=1, non-prod
 * only). Per-user rows written from preview sessions are attributed to
 * this id so the agents/feed/ask/pins surfaces can still be exercised
 * without a real Clerk session. Matches the value seeded by
 * supabase/seed.sql so a fresh dev DB already has data attributed to
 * this user.
 */
export const PREVIEW_USER_ID = "preview_user_dev";

const PREVIEW =
  process.env.NODE_ENV !== "production" &&
  process.env.LUMEN_PREVIEW === "1";

/**
 * Resolve the user id for the current server-side request. Always
 * returns a string — never null — so callers don't have to branch.
 *
 * - Real Clerk session → the Clerk subject (sub claim).
 * - Preview mode → PREVIEW_USER_ID.
 * - No session and not preview → throws. This is the auth-required path
 *   and the middleware should have already redirected; reaching here
 *   means something bypassed the gate, which we want to fail loudly.
 */
export async function getUserId(): Promise<string> {
  if (PREVIEW) {
    const { userId } = await auth();
    return userId ?? PREVIEW_USER_ID;
  }
  const { userId } = await auth();
  if (!userId) {
    throw new Error(
      "getUserId() called without a Clerk session — route is missing the auth gate.",
    );
  }
  return userId;
}
