// Smoke test for the Upstash credentials in .env.local.
//
// Runs against the same env vars the cache layer reads at runtime, so
// "this script passes" implies "the dashboard cache will land in the
// same Redis instance". Does not touch BigQuery or Clerk; safe to run
// anytime to verify the cache wiring without a dev server.
//
// Usage:
//   node --env-file=.env.local scripts/ping-redis.mjs

import { Redis } from "@upstash/redis";

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!url || !token) {
  console.error(
    "Missing UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN. Did you load .env.local? Try: node --env-file=.env.local scripts/ping-redis.mjs",
  );
  process.exit(1);
}

const redis = new Redis({ url, token });
const key = `lumen:cache:v1:_smoketest:ping:${Date.now()}`;
const value = { ok: true, at: new Date().toISOString() };

try {
  await redis.set(key, JSON.stringify(value), { ex: 30 });
  const got = await redis.get(key);
  const parsed = typeof got === "string" ? JSON.parse(got) : got;
  const removed = await redis.del(key);
  console.log(
    JSON.stringify(
      {
        result: "ok",
        url: url.replace(/^https?:\/\//, "").split(".")[0] + ".upstash.io",
        key,
        wrote: value,
        readBack: parsed,
        deleted: removed,
      },
      null,
      2,
    ),
  );
} catch (err) {
  console.error("Redis ping failed:", err instanceof Error ? err.message : err);
  process.exit(1);
}
