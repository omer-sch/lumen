"use client";

import * as Sentry from "@sentry/nextjs";
import NextError from "next/error";
import { useEffect } from "react";

/**
 * App Router global error boundary. Catches errors in the root layout
 * and any React render error that escapes a per-route error.tsx.
 * Required for @sentry/nextjs to capture every client-side React crash
 * — without it, root-layout errors fall through to the browser's
 * default error UI and never reach Sentry.
 *
 * Must include the "use client" directive on line 1 (per Sentry's
 * Next.js skill — App Router requires it for the boundary to register).
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <NextError statusCode={0} />
      </body>
    </html>
  );
}
