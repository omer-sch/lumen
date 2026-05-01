// Browser/client Sentry init. Auto-loaded by @sentry/nextjs on the
// client bundle. Filename per the modern Next.js convention
// (instrumentation-client.ts) — replaces the older sentry.client.config.ts
// pattern.

import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,

    // Tracing — 100% in dev for full visibility, 20% in prod to keep
    // event volume sane on the Sentry quota.
    tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.2,

    // Session Replay — record all error sessions, none of the rest.
    // Lets us see what the user did before a crash without burning
    // bandwidth on healthy sessions.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: process.env.NODE_ENV === "production" ? 1.0 : 0,

    // Sentry Logs product — enables Sentry.logger.* + log-to-trace
    // correlation when we add structured logging in Phase 2.
    enableLogs: true,

    // PII off — defence in depth. The security audit specifically
    // recommended NOT auto-attaching IPs / user-agents / request bodies
    // for an internal B2B app. The skill default is `true`; we override.
    sendDefaultPii: false,

    // Release + environment stamping from Vercel's build env.
    release: process.env.VERCEL_GIT_COMMIT_SHA,
    environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,

    // Replay integration — only loaded in prod to save ~50KB in dev
    // bundles where the SDK is already disabled by the DSN guard.
    integrations:
      process.env.NODE_ENV === "production"
        ? [
            Sentry.replayIntegration({
              maskAllText: true,
              blockAllMedia: true,
            }),
          ]
        : [],
  });
}

// App Router navigation tracing — fires a span on every router
// transition so we can see slow client navigations in the trace view.
// Required by @sentry/nextjs for the navigation hook.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
