// List every key under lumen:cache:v1:globalcomix:* so we can eyeball
// whether the warm pass actually populated Redis.
// Usage: node --env-file=.env.local scripts/list-cache-keys.mjs
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const match = "lumen:cache:v1:globalcomix:*";
let cursor = 0;
const found = [];
for (let i = 0; i < 50; i++) {
  const [next, batch] = await redis.scan(cursor, { match, count: 100 });
  found.push(...batch);
  if (next === 0 || next === "0") break;
  cursor = next;
}

console.log(`Found ${found.length} key(s) under ${match}:`);
for (const k of found.sort()) {
  const ttl = await redis.ttl(k);
  console.log(`  ${k}  (ttl ${ttl}s)`);
}
