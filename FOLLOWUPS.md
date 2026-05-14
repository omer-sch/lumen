# Followups discovered during the test-coverage push

Findings while writing the Step 2 lib unit tests (2026-05-14). Per the cowork
prompt's rules of engagement, product source code (anything under `src/`) was
not modified — these are documented for a separate pass.

## Build failure: pptxgenjs imports `node:fs` / `node:https`

**Status:** pre-existing on `main` (commit `a949334`).
**Reproduce:** `npm run build`.
**Error:**

```
Module build failed: UnhandledSchemeError: Reading from "node:fs" is not handled by plugins (Unhandled scheme).
Import trace for requested module:
  node:fs
  ./node_modules/pptxgenjs/dist/pptxgen.es.js
  ./src/lib/reports/export-pptx.ts
  ./src/components/reports/ReportsView.tsx
```

`pptxgenjs` (added in commit `5ae4b20`) is a Node-only library; the browser-
bundled ES entry references `node:fs` and `node:https` which webpack v5
refuses to inline. Verified pre-existing by stashing the test-only changes
and re-running `npm run build` against `HEAD` — same failure.

**Likely fixes (one needed):**

1. Switch the `pptxgenjs` import to a dynamic `await import()` inside a
   `"use server"` action or an API route, so the library is server-only
   and never enters the client bundle.
2. Mark `pptxgenjs` as a server-external in `next.config.ts`
   (`serverExternalPackages: ["pptxgenjs"]`) and ensure `export-pptx.ts`
   is only imported from a server context.
3. Replace `pptxgenjs` with a browser-native PPTX library (last resort —
   the API surface is non-trivial).

**Why this didn't block the test push:** the test runner uses Vitest's
own bundler (rolldown) which handles the `node:` scheme; coverage runs
green. The breakage is webpack-only and shows up on `next build` /
production deploys.

## ESLint warnings in `src/lib/bq-queries-100play.ts`

**Status:** pre-existing, warnings only.

```
239:3  Warning: '_from' is defined but never used.
240:3  Warning: '_to' is defined but never used.
```

Either delete the params (signature is `(client, from, to)` but those two
aren't consumed) or rename them away from the underscore-prefix form that
ESLint still flags. Cosmetic.
