import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// PREVIEW MODE — bypasses Clerk for local design work. Hard-gated to
// non-production builds: even if LUMEN_PREVIEW=1 leaks into a production
// environment (copy-pasted from preview config, accidental .env.production
// commit), this evaluates to false and the auth gate stays on.
const PREVIEW =
  process.env.NODE_ENV !== "production" &&
  process.env.LUMEN_PREVIEW === "1";

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/welcome(.*)",
  // Sentry tunnel route — receives Sentry SDK events from the browser
  // and forwards them server-side to bypass ad-blockers. Configured via
  // tunnelRoute in next.config.ts.
  "/monitoring(.*)",
  // Vercel cron invocations carry no Clerk session — they authenticate
  // via the `x-cron-secret` header which the route handler verifies in
  // constant time. Letting these past Clerk's auth gate is the only
  // way the cron job can ever reach the handler.
  "/api/cron/(.*)",
]);

// Routes that must stay behind Clerk even in PREVIEW mode:
//  - /api/bq/(.*)             — touch real client data in BigQuery.
//  - /api/agents/aria/generate — burns paid HF_TOKEN budget per call.
// Preview is for UI work against mock data, not for handing out customer
// revenue numbers or unauthenticated access to paid third-party APIs.
const isPreviewProtectedRoute = createRouteMatcher([
  "/api/bq/(.*)",
  "/api/agents/aria/generate",
]);

export default clerkMiddleware(async (auth, req) => {
  if (isPublicRoute(req)) return;
  if (PREVIEW && !isPreviewProtectedRoute(req)) return;
  await auth.protect({
    unauthenticatedUrl: new URL("/sign-in", req.url).toString(),
  });
});

export const config = {
  matcher: [
    "/((?!_next|.+\\.[\\w]+$).*)",
    "/",
    "/(api|trpc)(.*)",
  ],
};
