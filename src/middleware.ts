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
]);

export default clerkMiddleware(async (auth, req) => {
  if (PREVIEW || isPublicRoute(req)) return;
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
