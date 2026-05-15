import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { warmClientCache } from "@/lib/cache/warm";

export const runtime = "nodejs";
// The warm pass calls 7 BigQuery queries per client in parallel. Cap the
// route at the platform default (5 min) and let Vercel kill us if a
// single sweep ever runs that long — that's a BI incident, not a
// caching one.
export const maxDuration = 300;

/**
 * Twice-daily cache warmer. Scheduled in `vercel.json` and authorized
 * by the `x-cron-secret` request header (Vercel populates this from
 * the `CRON_SECRET` env var on cron-initiated invocations).
 *
 * `?client=` overrides the default active-clients list — useful for
 * manually re-warming a single client without sweeping the whole
 * roster.
 *
 * Why a route and not a server action: Vercel's cron product invokes
 * an HTTP endpoint on a schedule. The handler does no request-body
 * parsing because cron requests don't carry one; the active-clients
 * list comes from env so it's identical across cron and manual
 * `curl` invocations.
 */
export async function GET(req: NextRequest) {
  const provided = req.headers.get("x-cron-secret") ?? "";
  if (!isValidSecret(provided)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clientOverride = req.nextUrl.searchParams.get("client")?.trim();
  const clients = clientOverride
    ? [clientOverride]
    : parseActiveClients(process.env.LUMEN_ACTIVE_CLIENTS);

  const summary = [];
  for (const client of clients) {
    const queries = await warmClientCache(client);
    summary.push({ client, queries });
    console.info({
      event: "cache.warm",
      client,
      queries: queries.map((q) => ({
        query: q.query,
        ok: q.ok,
        latencyMs: q.latencyMs,
      })),
    });
  }

  return NextResponse.json({ clients: summary });
}

/**
 * Constant-time secret comparison. A timing-attack on a cron secret is
 * a theoretical concern more than a practical one, but the helper is
 * the same code we'd want for any shared-secret header and the cost
 * of doing it right is one extra function.
 */
function isValidSecret(provided: string): boolean {
  const expected = process.env.CRON_SECRET ?? "";
  if (!expected || expected.length !== provided.length) {
    // Length mismatch already fails — but still walk both strings to
    // avoid leaking length-based timing differences. Use a fixed
    // 32-byte sweep so all rejection paths take the same time.
    let diff = expected.length === provided.length ? 0 : 1;
    const len = Math.max(expected.length, provided.length, 32);
    for (let i = 0; i < len; i++) {
      diff |= (expected.charCodeAt(i) || 0) ^ (provided.charCodeAt(i) || 0);
    }
    return diff === 0 && expected.length > 0;
  }
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  }
  return diff === 0 && expected.length > 0;
}

function parseActiveClients(raw: string | undefined): string[] {
  if (!raw) return ["globalcomix"];
  const out = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return out.length > 0 ? out : ["globalcomix"];
}
