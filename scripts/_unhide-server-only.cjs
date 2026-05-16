// CJS preload that neutralises the `server-only` package for one-shot
// Node scripts (tsx / vitest / playwright already neutralise it on
// their own). The published module throws at import to keep server
// code out of client bundles; that protection is irrelevant when we
// are deliberately running server code from a CLI script. We resolve
// the request to an empty CJS file so subsequent imports of
// `"server-only"` are a no-op.
//
// Use:
//   node --require ./scripts/_unhide-server-only.cjs <script.ts>
// or with tsx:
//   node --require ./scripts/_unhide-server-only.cjs --import tsx <script.ts>

const Module = require("node:module");
const path = require("node:path");

const STUB_PATH = path.resolve(__dirname, "_server-only-stub.cjs");

const origResolve = Module._resolveFilename;
Module._resolveFilename = function patched(request, ...args) {
  if (request === "server-only") return STUB_PATH;
  return origResolve.call(this, request, ...args);
};
