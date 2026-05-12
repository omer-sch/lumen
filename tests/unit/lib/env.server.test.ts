// Layer 2 (backend lib unit). File under test: src/lib/env.server.ts. Priority: P0.
// Fail-closed semantics: required vars throw, optional vars return "". A
// misconfigured prod env must abort instead of silently falling through.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("env.server", () => {
  beforeEach(() => {
    // Wipe all vars this module reads so each test starts from a known state.
    for (const k of [
      "CLERK_SECRET_KEY",
      "ANTHROPIC_API_KEY",
      "FAL_KEY",
      "HF_TOKEN",
      "SENTRY_DSN",
      "GOOGLE_APPLICATION_CREDENTIALS_JSON",
      "BQ_PROJECT",
      "BQ_DATASET",
      "ALLOWED_CLIENTS",
      "NEXT_PUBLIC_SUPABASE_URL",
      "SUPABASE_URL",
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      "SUPABASE_PUBLISHABLE_KEY",
      "SUPABASE_SERVICE_ROLE_KEY",
    ]) {
      vi.stubEnv(k, "");
    }
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("CLERK_SECRET_KEY is required: read throws with a helpful message", async () => {
    const { serverEnv } = await import("@/lib/env.server");
    expect(() => serverEnv.CLERK_SECRET_KEY).toThrow(
      /Missing required environment variable: CLERK_SECRET_KEY/,
    );
  });

  it("BQ_PROJECT / BQ_DATASET / ALLOWED_CLIENTS are required", async () => {
    const { serverEnv } = await import("@/lib/env.server");
    expect(() => serverEnv.BQ_PROJECT).toThrow(/BQ_PROJECT/);
    expect(() => serverEnv.BQ_DATASET).toThrow(/BQ_DATASET/);
    expect(() => serverEnv.ALLOWED_CLIENTS).toThrow(/ALLOWED_CLIENTS/);
  });

  it("optional vars return empty string instead of throwing", async () => {
    const { serverEnv } = await import("@/lib/env.server");
    expect(serverEnv.ANTHROPIC_API_KEY).toBe("");
    expect(serverEnv.FAL_KEY).toBe("");
    expect(serverEnv.HF_TOKEN).toBe("");
    expect(serverEnv.SENTRY_DSN).toBe("");
    expect(serverEnv.GOOGLE_APPLICATION_CREDENTIALS_JSON).toBe("");
  });

  it("SUPABASE_URL accepts the NEXT_PUBLIC_ variant", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abc.supabase.co");
    const { serverEnv } = await import("@/lib/env.server");
    expect(serverEnv.SUPABASE_URL).toBe("https://abc.supabase.co");
  });

  it("SUPABASE_URL falls back to the bare SUPABASE_URL variant", async () => {
    vi.stubEnv("SUPABASE_URL", "https://def.supabase.co");
    const { serverEnv } = await import("@/lib/env.server");
    expect(serverEnv.SUPABASE_URL).toBe("https://def.supabase.co");
  });

  it("SUPABASE_ANON_KEY accepts either env name", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon-key-1");
    const { serverEnv } = await import("@/lib/env.server");
    expect(serverEnv.SUPABASE_ANON_KEY).toBe("anon-key-1");

    vi.unstubAllEnvs();
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "anon-key-2");
    const m2 = await import("@/lib/env.server");
    expect(m2.serverEnv.SUPABASE_ANON_KEY).toBe("anon-key-2");
  });

  describe("isSupabaseConfigured", () => {
    it("is false when URL is missing", async () => {
      vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "k");
      const { isSupabaseConfigured } = await import("@/lib/env.server");
      expect(isSupabaseConfigured()).toBe(false);
    });

    it("is false when service-role key is missing", async () => {
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
      const { isSupabaseConfigured } = await import("@/lib/env.server");
      expect(isSupabaseConfigured()).toBe(false);
    });

    it("is true when both are set (NEXT_PUBLIC_ variant)", async () => {
      vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
      vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "k");
      const { isSupabaseConfigured } = await import("@/lib/env.server");
      expect(isSupabaseConfigured()).toBe(true);
    });

    it("is true when both are set (bare SUPABASE_URL variant)", async () => {
      // The product uses `??` which only falls back on undefined, so the
      // NEXT_PUBLIC_ variant has to actually be absent (not stubbed to "")
      // for the bare SUPABASE_URL to win. Reset env so beforeEach's blank
      // value does not short-circuit the nullish fallback.
      vi.unstubAllEnvs();
      vi.stubEnv("SUPABASE_URL", "https://x.supabase.co");
      vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "k");
      const { isSupabaseConfigured } = await import("@/lib/env.server");
      expect(isSupabaseConfigured()).toBe(true);
    });
  });

  describe("assertServerEnv", () => {
    it("throws when CLERK_SECRET_KEY is missing", async () => {
      const { assertServerEnv } = await import("@/lib/env.server");
      expect(() => assertServerEnv()).toThrow(/CLERK_SECRET_KEY/);
    });

    it("does not throw when CLERK_SECRET_KEY is set", async () => {
      vi.stubEnv("CLERK_SECRET_KEY", "sk_test");
      const { assertServerEnv } = await import("@/lib/env.server");
      expect(() => assertServerEnv()).not.toThrow();
    });
  });
});
