import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Capture 100% of traces in dev; lower this in production if costs matter.
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.2 : 1.0,

  // Session replay: record 10% of sessions, 100% of sessions with errors.
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  integrations: [
    Sentry.replayIntegration({
      // Mask text and block media by default to avoid capturing sensitive data.
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],

  // Don't show the Sentry dialog in dev — just log to console.
  debug: false,
});
