// Next.js calls register() once when the server boots. Used for Sentry
// initialisation and our own server-env validation.

import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
    const { assertServerEnv } = await import("./lib/env.server");
    assertServerEnv();
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }
}

// Captures every unhandled server-side request error into Sentry.
// Direct re-export per the @sentry/nextjs ≥ 8.28 pattern — no wrapper.
export const onRequestError = Sentry.captureRequestError;
