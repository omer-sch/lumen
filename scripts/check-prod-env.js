#!/usr/bin/env node
/**
 * Prebuild guard: refuse to build for production while LUMEN_PREVIEW is
 * set. The middleware / page / db-user gates already AND with NODE_ENV
 * before honouring the flag, but the conjunction relies on Vercel never
 * setting LUMEN_PREVIEW=1 in a prod env. This is the single-line
 * assertion that closes the residual-risk class. See M6 in
 * security-scan-2026-05-12-v2.md.
 *
 * Skips quietly outside production builds so `next build` for preview
 * deployments and local `next dev` are unaffected.
 */
const isProdBuild =
  process.env.VERCEL_ENV === "production" ||
  process.env.NODE_ENV === "production";

if (isProdBuild && process.env.LUMEN_PREVIEW) {
  console.error(
    "[ci-guard] LUMEN_PREVIEW must NOT be set in production builds — " +
      "current value: " +
      JSON.stringify(process.env.LUMEN_PREVIEW),
  );
  process.exit(1);
}
