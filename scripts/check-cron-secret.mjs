// Probe whether CRON_SECRET is set in the env without printing it.
// Usage: node --env-file=.env.local scripts/check-cron-secret.mjs
const s = process.env.CRON_SECRET ?? "";
if (!s) {
  console.error("CRON_SECRET is not set in .env.local");
  process.exit(1);
}
if (s.length < 16) {
  console.warn(
    `CRON_SECRET is set but is only ${s.length} chars; recommend 32+ random chars for a shared header secret.`,
  );
} else {
  console.log(`CRON_SECRET is set (${s.length} chars). Looks good.`);
}
