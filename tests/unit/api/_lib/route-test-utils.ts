// Shared helpers for route-handler tests.
//
// Route-handler tests live one level below E2E and above lib-unit:
// they exercise the parse/dispatch/translate logic inside `src/app/api/*`
// route files, with the underlying source (BigQuery, Supabase, Anthropic
// SDK, fetch) mocked at the module boundary. Auth is enforced by Clerk
// middleware (see `src/middleware.ts`), NOT inside each handler, so route
// tests do not assert "unauth returns 401"; that contract belongs to the
// middleware suite + the `api-auth-matrix.spec.ts` Playwright probe.
import { NextRequest } from "next/server";
import { expect } from "vitest";

/**
 * Build a `NextRequest` for `route.ts`-style handlers. Accepts any URL
 * (relative paths get a `http://localhost` base) and an optional method/
 * body init. Use this instead of constructing a plain Request because
 * the handlers reach for `req.nextUrl.searchParams` / `req.url` and the
 * NextRequest superclass wires those up.
 */
export function buildRequest(
  url: string,
  init?: { method?: string; body?: unknown; headers?: HeadersInit },
): NextRequest {
  const absolute = url.startsWith("http") ? url : `http://localhost${url}`;
  const method = init?.method ?? "GET";
  const headers = new Headers(init?.headers);
  let body: BodyInit | undefined;
  if (init?.body !== undefined) {
    if (typeof init.body === "string") {
      body = init.body;
    } else {
      body = JSON.stringify(init.body);
      if (!headers.has("content-type")) {
        headers.set("content-type", "application/json");
      }
    }
  }
  return new NextRequest(absolute, { method, body, headers });
}

/**
 * Read the body of a `NextResponse` (or any `Response`) as JSON and
 * assert the status code in one call. Tightens up the most common
 * three-line dance in every route test.
 */
export async function expectJson<T = unknown>(
  res: Response,
  status: number,
): Promise<T> {
  expect(res.status).toBe(status);
  return (await res.json()) as T;
}

/**
 * Confirm an error response uses a safe generic message instead of
 * echoing the upstream error (which can leak schema / column / row
 * detail back to the client).
 */
export async function expectSafeError(
  res: Response,
  status: number,
  expectedShape?: RegExp,
): Promise<void> {
  expect(res.status).toBe(status);
  const body = (await res.json()) as { error?: unknown };
  expect(typeof body.error).toBe("string");
  const msg = String(body.error);
  // Anything that smells like a BigQuery / stack-trace leak should
  // never reach the client.
  expect(msg).not.toMatch(/at\s+.+\(.+:\d+:\d+\)/); // stack frame
  expect(msg).not.toMatch(/permission denied for table/i);
  if (expectedShape) expect(msg).toMatch(expectedShape);
}
