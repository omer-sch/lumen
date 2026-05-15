// End-to-end verification of the Sync now primitives: invalidate the
// client's cache, then re-warm. Exactly what the admin route does, just
// without the Clerk session gate. Useful for verification when you
// don't have a browser session handy.
//
// Usage: node --env-file=.env.local scripts/verify-sync-now.mjs
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const CLIENT = process.argv[2] ?? "globalcomix";
const prefix = `lumen:cache:v1:${CLIENT}:*`;

async function listKeys() {
  const out = [];
  let cursor = 0;
  for (let i = 0; i < 50; i++) {
    const [next, batch] = await redis.scan(cursor, { match: prefix, count: 100 });
    out.push(...batch);
    if (next === 0 || next === "0") break;
    cursor = next;
  }
  return out.sort();
}

async function invalidate() {
  const keys = await listKeys();
  if (keys.length === 0) return 0;
  return await redis.unlink(...keys);
}

const before = await listKeys();
console.log(`Before: ${before.length} key(s)`);
before.forEach((k) => console.log(`  ${k}`));

const removed = await invalidate();
console.log(`Invalidated: ${removed} key(s) removed`);

const empty = await listKeys();
console.log(`After invalidate: ${empty.length} key(s)`);

console.log("Triggering warm via /api/cron/warm-cache (uses CRON_SECRET)...");
const res = await fetch(`http://localhost:3000/api/cron/warm-cache?client=${CLIENT}`, {
  headers: { "x-cron-secret": process.env.CRON_SECRET ?? "" },
});
if (!res.ok) {
  console.error("Warm failed:", res.status, await res.text());
  process.exit(1);
}
const warmed = await res.json();
console.log("Warm result:", JSON.stringify(warmed, null, 2));

const after = await listKeys();
console.log(`After warm: ${after.length} key(s)`);
after.forEach(async (k) => console.log(`  ${k}  (ttl ${await redis.ttl(k)}s)`));
