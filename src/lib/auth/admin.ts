import "server-only";

import { auth, currentUser } from "@clerk/nextjs/server";

/**
 * Is the current request from an admin user.
 *
 * "Admin" today is a thin concept: a hand-curated list allowed to
 * trigger destructive cache operations (the "Sync now" button, future
 * bulk invalidations). We deliberately keep this server side and out
 * of the JWT so a user cannot mint themselves an admin claim — the
 * gate reads the configured allowlist from env every call.
 *
 * Two env vars, both comma-separated, OR-matched:
 *   - `LUMEN_ADMIN_USER_IDS` (e.g. `user_2a…b,user_2c…d`) — the
 *     cheapest path; matched without a second Clerk round-trip.
 *   - `LUMEN_ADMIN_EMAILS`   (e.g. `omer@example.com,gal@example.com`)
 *     — the operator-friendly path when you don't have Clerk IDs at
 *     hand. Matching is case-insensitive. Triggers a `currentUser()`
 *     fetch, which costs a Clerk API call per gated request, so the
 *     id path is preferred for hot routes.
 *
 * Both unset / empty means *no users are admins* — fail closed.
 *
 * A later Clerk-organizations migration can replace either of these
 * with `sessionClaims.org_role` without changing callers.
 *
 * Returns the Clerk user id when admin, `null` otherwise.
 */
export async function getAdminUserId(): Promise<string | null> {
  const { userId } = await auth();
  if (!userId) return null;

  // 1. User-id allowlist (cheap — no extra Clerk call).
  const idAllow = parseList(process.env.LUMEN_ADMIN_USER_IDS);
  if (idAllow.includes(userId)) return userId;

  // 2. Email allowlist. Only paid if the env var is set — keeps the
  //    fast path fast for deployments that use the id list exclusively.
  const emailAllow = parseList(process.env.LUMEN_ADMIN_EMAILS).map((s) =>
    s.toLowerCase(),
  );
  if (emailAllow.length === 0) return null;

  const user = await currentUser();
  // Prefer the primary email; fall back to the first verified address
  // so a user with primaryEmailAddressId still unset (rare, new signup)
  // doesn't lose admin access on a session-state edge.
  const email =
    user?.primaryEmailAddress?.emailAddress?.toLowerCase() ??
    user?.emailAddresses?.[0]?.emailAddress?.toLowerCase();
  if (email && emailAllow.includes(email)) return userId;

  return null;
}

/**
 * Convenience boolean for places that don't need the id (e.g. the
 * cache-stats route, which only needs to authorize, not attribute).
 */
export async function isAdminUser(): Promise<boolean> {
  return (await getAdminUserId()) != null;
}

function parseList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
