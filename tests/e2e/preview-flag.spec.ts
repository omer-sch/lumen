import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

// Source-level regression guard for the LUMEN_PREVIEW auth-bypass flag.
//
// The flag exists for local design work — it short-circuits Clerk so the
// app is reachable without a session. The risk is operational: if the
// var leaks into a production environment, the entire app goes public
// with no log line.
//
// The fix is a hard `NODE_ENV !== "production"` gate at the only two
// places that read the var. These tests pin that contract so a future
// PR that removes either guard fails CI loudly. They run as a static
// check against the source files — runtime verification would require a
// full production build inside Playwright, which isn't worth the cycle
// time when the static guarantee covers the same ground.

const repoRoot = path.resolve(__dirname, "..", "..");

const ENVIRONMENTAL_GUARD = /process\.env\.NODE_ENV\s*!==\s*["']production["']/;
const PREVIEW_FLAG = /process\.env\.LUMEN_PREVIEW\s*===\s*["']1["']/;

const filesThatReadPreview = [
  "src/middleware.ts",
  "src/app/page.tsx",
];

test.describe("LUMEN_PREVIEW — production guard", () => {
  for (const rel of filesThatReadPreview) {
    test(`${rel} gates LUMEN_PREVIEW behind NODE_ENV !== "production"`, () => {
      const src = readFileSync(path.join(repoRoot, rel), "utf8");

      // Sanity: the file actually reads the var. If this fails, the test
      // is pointing at the wrong file and needs to be updated.
      expect(
        PREVIEW_FLAG.test(src),
        `${rel} should reference LUMEN_PREVIEW`,
      ).toBe(true);

      // The contract: every read of LUMEN_PREVIEW must be paired with a
      // NODE_ENV check on the same logical branch. We assert both
      // patterns exist in the file; manual review covers "are they on
      // the same branch?" since a heuristic for that is fragile.
      expect(
        ENVIRONMENTAL_GUARD.test(src),
        `${rel} must guard LUMEN_PREVIEW behind a NODE_ENV !== "production" check — see src/middleware.ts for the pattern`,
      ).toBe(true);
    });
  }

  test("no other source file silently honours LUMEN_PREVIEW", async () => {
    // If any other file starts reading LUMEN_PREVIEW, it needs the same
    // NODE_ENV gate. This sweep makes sure we don't grow new readers
    // without updating the allow-list above.
    const { execSync } = await import("node:child_process");
    const grep = execSync(
      `grep -rln "LUMEN_PREVIEW" ${path.join(repoRoot, "src")} || true`,
      { encoding: "utf8" },
    )
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((p) => path.relative(repoRoot, p));

    const expected = new Set(filesThatReadPreview);
    const surprising = grep.filter((f) => !expected.has(f));
    expect(
      surprising,
      `Unexpected file(s) reference LUMEN_PREVIEW. Add them to filesThatReadPreview in this test (and confirm they have the NODE_ENV guard): ${surprising.join(", ")}`,
    ).toEqual([]);
  });
});
