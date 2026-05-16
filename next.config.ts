import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// Note on `'unsafe-inline'`: Next.js App Router still injects inline bootstrap
// scripts in production. Removing it requires per-request nonces in middleware,
// which we'll add when we ship our first /api route. Tracking: TODO Phase 1.
// We've removed `'unsafe-eval'` because nothing in this stack needs it.
const ContentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://*.clerk.accounts.dev https://*.clerk.com https://challenges.cloudflare.com https://browser.sentry-cdn.com https://*.posthog.com",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https://img.clerk.com https://*.clerk.com",
  // Anthropic intentionally NOT here — Claude calls go through our /api routes only.
  "connect-src 'self' https://*.clerk.accounts.dev https://*.clerk.com https://*.sentry.io https://*.ingest.sentry.io https://*.posthog.com https://us.i.posthog.com",
  "frame-src https://*.clerk.accounts.dev https://*.clerk.com https://challenges.cloudflare.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: ContentSecurityPolicy },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  // Cross-origin isolation hardening
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Cross-Origin-Resource-Policy", value: "same-site" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  productionBrowserSourceMaps: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // pptxgenjs imports `node:https` / `node:fs` for optional Node-only
  // image fetching. Those code paths never run in the browser, but
  // webpack still tries to resolve the imports at build time and trips
  // on the `node:` scheme. IgnorePlugin makes any `node:*` import a
  // no-op in the client bundle (the resourceRegExp is matched before
  // resolution); the server bundle is untouched.
  webpack: (config, { isServer, webpack }) => {
    if (!isServer) {
      config.plugins = config.plugins ?? [];
      config.plugins.push(
        new webpack.IgnorePlugin({ resourceRegExp: /^node:/ }),
      );
    }
    return config;
  },
};

export default withSentryConfig(nextConfig, {
  // Sentry organization and project come from SENTRY_ORG and SENTRY_PROJECT env vars.
  // Source maps are uploaded to Sentry on `next build`. We keep them out
  // of the public bundle via productionBrowserSourceMaps:false above.
  silent: !process.env.CI,
  widenClientFileUpload: true,
  disableLogger: true,
  automaticVercelMonitors: true,
  // Tunnel client-side Sentry events through /monitoring on our own
  // origin so ad-blockers don't drop them. The middleware excludes the
  // path explicitly (see src/middleware.ts) so it isn't auth-gated.
  tunnelRoute: "/monitoring",
});
