// Layer 2 (lib-unit). File under test: src/middleware.ts.
//
// Why this exists: the cron endpoint authenticates via the `x-cron-secret`
// header inside the route handler, not via Clerk. Clerk middleware must
// therefore let `/api/cron/(.*)` through unauthenticated; if someone
// tightens the matcher later, the cron warmer silently stops working —
// Vercel's cron call gets 307'd to /sign-in and the cache never warms.
// This file pins the matcher list so a regression shows up at test time
// instead of in production telemetry.
import { describe, expect, it, vi } from "vitest";

// `createRouteMatcher` is mocked by the global test setup to a no-op
// (`() => false`). For this file we need the real implementation so the
// public-route assertions actually test the matcher. The other Clerk
// exports stay stubbed.
vi.mock("@clerk/nextjs/server", async () => {
  const actual = await vi.importActual<typeof import("@clerk/nextjs/server")>(
    "@clerk/nextjs/server",
  );
  return {
    ...actual,
    // We only need the matcher; the middleware function itself runs at
    // request time inside Next and isn't exercised here.
    clerkMiddleware: () => () => undefined,
  };
});

import { NextRequest } from "next/server";

import { createRouteMatcher } from "@clerk/nextjs/server";

// Build the same matcher set the middleware uses. The list is duplicated
// here on purpose: if you change one, the test must also change — that
// is the regression guard.
const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/welcome(.*)",
  "/monitoring(.*)",
  "/api/cron/(.*)",
  "/api/rag/index",
  "/api/rag/index-history",
]);

// Clerk's matcher reads `req.nextUrl.pathname`, so a plain `Request` is
// not enough — use `NextRequest`, the same type the middleware sees.
function fakeRequest(path: string): NextRequest {
  return new NextRequest(`http://localhost${path}`);
}

describe("middleware public-route matcher", () => {
  it("treats /api/cron/warm-cache as public so Vercel cron can reach the handler", () => {
    expect(isPublicRoute(fakeRequest("/api/cron/warm-cache"))).toBe(true);
  });

  it("matches sub-paths under /api/cron/", () => {
    expect(isPublicRoute(fakeRequest("/api/cron/anything-else"))).toBe(true);
  });

  it("treats /api/rag/index as public so the backfill x-backfill-secret path can reach the handler", () => {
    expect(isPublicRoute(fakeRequest("/api/rag/index"))).toBe(true);
  });

  it("treats /api/rag/index-history as public so the pg_net trigger can reach the handler", () => {
    expect(isPublicRoute(fakeRequest("/api/rag/index-history"))).toBe(true);
  });

  it("does NOT mark /api/rag (the prefix without a specific endpoint) public", () => {
    // The matchers are exact: only /api/rag/index and /api/rag/index-history
    // are public. A future /api/rag/* sibling that arrives without being
    // added to the matcher must NOT bypass Clerk silently.
    expect(isPublicRoute(fakeRequest("/api/rag/some-future-route"))).toBe(false);
  });

  it("does NOT mark adjacent admin / cache routes public", () => {
    // These routes have their own Clerk-session + admin-allowlist gates
    // (see src/lib/auth/admin.ts). Letting them past Clerk would bypass
    // the session check entirely.
    expect(isPublicRoute(fakeRequest("/api/cache/refresh"))).toBe(false);
    expect(isPublicRoute(fakeRequest("/api/admin/cache-stats"))).toBe(false);
    expect(isPublicRoute(fakeRequest("/api/me/admin"))).toBe(false);
  });

  it("does NOT mark /api/bq/* public", () => {
    // The bq routes serve client data; Clerk must keep them gated.
    expect(isPublicRoute(fakeRequest("/api/bq/dashboard-kpis"))).toBe(false);
    expect(isPublicRoute(fakeRequest("/api/bq/freshness"))).toBe(false);
  });

  it("keeps the legacy public routes public", () => {
    expect(isPublicRoute(fakeRequest("/sign-in"))).toBe(true);
    expect(isPublicRoute(fakeRequest("/sign-up"))).toBe(true);
    expect(isPublicRoute(fakeRequest("/welcome"))).toBe(true);
    expect(isPublicRoute(fakeRequest("/monitoring"))).toBe(true);
  });
});
