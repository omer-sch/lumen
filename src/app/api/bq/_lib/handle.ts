import "server-only";

import { NextResponse } from "next/server";
import {
  ClientNotPermittedError,
  UnknownClientTableError,
} from "@/lib/bq-security";
import { InvalidDateError } from "@/lib/bq-queries";
import {
  isOsFilter,
  isPlatformFilter,
  type OsFilter,
  type PlatformFilter,
} from "@/lib/filters/types";

/**
 * Centralized error translation for `/api/bq/*` routes. Never echoes a raw
 * BigQuery error to the client — those can leak schema / column names.
 *
 *  403 ClientNotPermittedError / UnknownClientTableError
 *  400 InvalidDateError, missing params
 *  500 anything else
 */
export function bqErrorResponse(err: unknown, tag: string): NextResponse {
  if (err instanceof ClientNotPermittedError) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (err instanceof UnknownClientTableError) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (err instanceof InvalidDateError) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const message = err instanceof Error ? err.message : String(err);
  console.error(`[bq:${tag}]`, message);
  return NextResponse.json({ error: "Query failed" }, { status: 500 });
}

export function requireParams(
  searchParams: URLSearchParams,
  names: string[],
): Record<string, string> | NextResponse {
  const out: Record<string, string> = {};
  for (const n of names) {
    const raw = searchParams.get(n);
    // Trim so whitespace-only values (`?client=%20`) fail validation here
    // rather than wandering into the allowlist check as a non-empty string.
    const v = raw?.trim() ?? "";
    if (!v) {
      return NextResponse.json(
        { error: `Missing required param: ${n}` },
        { status: 400 },
      );
    }
    out[n] = v;
  }
  // The `client` param is case-insensitive in BQ-security; normalize once
  // here so cache keys ("bq:kpis", client, …) don't fragment across
  // casing variants and so the rest of the stack sees one canonical value.
  if ("client" in out) out.client = out.client.toLowerCase();
  return out;
}

/**
 * Parse the WS6 global filter query params (`os`, `platforms`). Returns
 * a typed filter object or a 400 response on invalid input. Both params
 * are optional and default to the no-filter state ({}); when present
 * they're strictly validated against the whitelist enums.
 *
 * `platforms` is a comma-separated list of `IntentChannel` slugs.
 */
export function parseGlobalFilter(
  searchParams: URLSearchParams,
):
  | { os?: OsFilter; platforms?: PlatformFilter[] }
  | NextResponse {
  const out: { os?: OsFilter; platforms?: PlatformFilter[] } = {};

  const osRaw = searchParams.get("os")?.trim().toLowerCase();
  if (osRaw) {
    if (!isOsFilter(osRaw)) {
      return NextResponse.json(
        { error: `Invalid os filter: ${osRaw}` },
        { status: 400 },
      );
    }
    if (osRaw !== "total") out.os = osRaw;
  }

  const platformsRaw = searchParams.get("platforms")?.trim();
  if (platformsRaw) {
    const platforms: PlatformFilter[] = [];
    for (const token of platformsRaw.split(",")) {
      const t = token.trim().toLowerCase();
      if (!t) continue;
      if (!isPlatformFilter(t)) {
        return NextResponse.json(
          { error: `Invalid platforms entry: ${t}` },
          { status: 400 },
        );
      }
      if (!platforms.includes(t)) platforms.push(t);
    }
    if (platforms.length > 0) out.platforms = platforms;
  }

  return out;
}
