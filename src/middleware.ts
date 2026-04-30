import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// PREVIEW MODE — when LUMEN_PREVIEW=1, auth is bypassed for local design work.
// Off by default. Must be unset for any real deployment.
const PREVIEW = process.env.LUMEN_PREVIEW === "1";

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
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
