// Server-side (Node.js runtime) Sentry init. Imported by
// src/instrumentation.ts on Node runtime boot. DSN-gated so a deploy
// without the env var stays silent.

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,

    tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

    // Sentry Logs — same posture as the client config.
    enableLogs: true,

    // Attach local variable values to stack frames. Higher signal,
    // higher PII risk — paired with sendDefaultPii:false below so we
    // see locals but not request bodies/headers.
    includeLocalVariables: true,

    // PII off per the security-audit recommendation.
    sendDefaultPii: false,

    release: process.env.VERCEL_GIT_COMMIT_SHA,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  });
}
