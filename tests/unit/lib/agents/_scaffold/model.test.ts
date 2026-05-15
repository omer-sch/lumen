// @vitest-environment node
// Layer 2 (lib unit). File under test:
// src/lib/agents/_scaffold/model.ts. Runs in node env (not jsdom)
// because the Anthropic SDK refuses to initialize in a browser-like
// environment.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("pickModel", () => {
  it("returns the Haiku 4.5 model id", async () => {
    const { pickModel } = await import("@/lib/agents/_scaffold/model");
    expect(pickModel("haiku")).toBe("claude-haiku-4-5-20251001");
  });

  it("returns the Sonnet 4.6 model id", async () => {
    const { pickModel } = await import("@/lib/agents/_scaffold/model");
    expect(pickModel("sonnet")).toBe("claude-sonnet-4-6");
  });

  it("returns the Opus 4.7 model id", async () => {
    const { pickModel } = await import("@/lib/agents/_scaffold/model");
    expect(pickModel("opus")).toBe("claude-opus-4-7");
  });

  it("throws on an unknown tier", async () => {
    const { pickModel } = await import("@/lib/agents/_scaffold/model");
    expect(() => pickModel("unknown" as never)).toThrow(/Unknown model tier/);
  });
});

describe("getAnthropicClient", () => {
  it("throws a helpful error when ANTHROPIC_API_KEY is unset", async () => {
    const { getAnthropicClient } = await import(
      "@/lib/agents/_scaffold/model"
    );
    expect(() => getAnthropicClient()).toThrow(/ANTHROPIC_API_KEY/);
  });

  it("constructs and caches a client once the key is set", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-anthropic-test");
    const { getAnthropicClient } = await import(
      "@/lib/agents/_scaffold/model"
    );
    const a = getAnthropicClient();
    const b = getAnthropicClient();
    expect(a).toBe(b); // cached singleton
  });

  it("test seam: __setAnthropicClientForTesting resets the singleton", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-anthropic-test");
    const mod = await import("@/lib/agents/_scaffold/model");
    const fake = { fake: true } as never;
    mod.__setAnthropicClientForTesting(fake);
    expect(mod.getAnthropicClient()).toBe(fake);
    mod.__setAnthropicClientForTesting(null);
  });
});
