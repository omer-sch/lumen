import "server-only";

import { auth } from "@clerk/nextjs/server";

import { rateLimit } from "@/lib/rate-limit";

// Auth gate for non-agent API routes (Reports, Ask, Pins, etc.). Pairs
// a Clerk session with a per-scope sliding-window rate limit. Mirrors
// requireAgentAuth() in src/lib/agents/_scaffold/auth.ts but isn't
// agent-named, so the rate limit bucket is keyed on the route's scope.
//
// PREVIEW mode: when LUMEN_PREVIEW=1 in a non-production build, the
// middleware skips Clerk for non-protected routes. requireUser() honours
// that by handing back a stable "preview-user" id so the surface can
// still write to Supabase. The middleware's PREVIEW guard keeps this
// from ever firing in production.

const PREVIEW =
  process.env.NODE_ENV !== "production" &&
  process.env.LUMEN_PREVIEW === "1";

const PREVIEW_USER_ID = "preview-user";

export type RequireUserResult =
  | { ok: true; userId: string }
  | { ok: false; status: 401; error: string }
  | {
      ok: false;
      status: 429;
      error: string;
      retryAfterSeconds: number;
    };

export type RequireUserOptions = {
  /** Bucket label used in the rate-limit key. Required so each surface
   *  gets its own budget instead of all sharing one. */
  scope: string;
  /** Max requests per user per window. Default 120 / 5 min. */
  maxPerWindow?: number;
  /** Sliding-window length in ms. */
  windowMs?: number;
};

const DEFAULT_MAX = 120;
const DEFAULT_WINDOW_MS = 5 * 60 * 1000;

export async function requireUser(
  options: RequireUserOptions,
): Promise<RequireUserResult> {
  const { userId: clerkUserId } = await auth();
  const userId = clerkUserId ?? (PREVIEW ? PREVIEW_USER_ID : null);
  if (!userId) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }
  const result = rateLimit(
    `${options.scope}:${userId}`,
    options.maxPerWindow ?? DEFAULT_MAX,
    options.windowMs ?? DEFAULT_WINDOW_MS,
  );
  if (!result.allowed) {
    return {
      ok: false,
      status: 429,
      error: `Rate limit exceeded for ${options.scope}. Retry in ${result.retryAfterSeconds}s.`,
      retryAfterSeconds: result.retryAfterSeconds,
    };
  }
  return { ok: true, userId };
}
