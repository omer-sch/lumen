// Layer 2 (lib unit). File under test: src/lib/env.client.ts. Priority: P0.
// Client-side env reader. The module evaluates publicEnv at import time,
// which means a missing NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY throws while the
// app is loading — fail-loud rather than ship a dev who sees Clerk widgets
// silently fail to mount. Each test resets the module registry so the eval
// happens fresh against a controlled env.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const VAR = "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY";

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("publicEnv", () => {
  it("throws at import time when NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is missing", async () => {
    vi.stubEnv(VAR, "");
    await expect(() => import("@/lib/env.client")).rejects.toThrow(
      /Missing required environment variable: NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY/,
    );
  });

  it("error message references the example file so devs know where to look", async () => {
    vi.stubEnv(VAR, "");
    try {
      await import("@/lib/env.client");
      throw new Error("expected import to throw");
    } catch (err) {
      expect((err as Error).message).toMatch(/\.env\.local\.example/);
    }
  });

  it("exports the value when the env var is set", async () => {
    vi.stubEnv(VAR, "pk_test_abc123");
    const { publicEnv } = await import("@/lib/env.client");
    expect(publicEnv.CLERK_PUBLISHABLE_KEY).toBe("pk_test_abc123");
  });

  it("publicEnv is a readonly object (`as const`)", async () => {
    vi.stubEnv(VAR, "pk_test_x");
    const { publicEnv } = await import("@/lib/env.client");
    // The type-level "as const" yields a frozen-shaped object at runtime
    // only in TS terms, but the runtime should still be a plain object
    // with the expected key. Just assert key presence.
    expect(Object.keys(publicEnv)).toContain("CLERK_PUBLISHABLE_KEY");
  });
});
