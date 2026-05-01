// Edge runtime Sentry init. Imported by src/instrumentation.ts when a
// route handler runs on the edge (today: just our middleware). Same
// posture as server — DSN-gated, no PII, conservative sample rate.

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,

    tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
    enableLogs: true,
    sendDefaultPii: false,

    release: process.env.VERCEL_GIT_COMMIT_SHA,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
  });
}
