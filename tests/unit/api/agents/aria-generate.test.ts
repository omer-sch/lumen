// Layer 3 (API route-handler). File under test:
// src/app/api/agents/aria/generate/route.ts. Priority: P0.
// Aria is the image-gen agent. The route proxies Hugging Face's FLUX.1
// schnell model. Tests cover token presence, rate limiting, prompt
// validation, the warm-up branch, and the success path. We mock fetch
// (no live HF call) and the rate-limit module (deterministic).
//
// Note: the cowork prompt says "mock the Anthropic client" — this route
// actually uses Hugging Face's REST API via fetch, not the Anthropic SDK.
// Mocking fetch is the right substitution.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildRequest, expectJson } from "../_lib/route-test-utils";

const { rateLimit, getUserId } = vi.hoisted(() => ({
  rateLimit: vi.fn(),
  getUserId: vi.fn(),
}));


vi.mock("@/lib/rate-limit", () => ({ rateLimit }));
vi.mock("@/lib/db/user", () => ({ getUserId }));

beforeEach(() => {
  vi.resetModules();
  rateLimit.mockReset();
  getUserId.mockReset();
  getUserId.mockResolvedValue("user_test");
  rateLimit.mockReturnValue({ allowed: true, remaining: 9 });
  vi.stubEnv("HF_TOKEN", "hf_test_token");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mockFetch(res: Response) {
  const fetchMock = vi.fn().mockResolvedValue(res);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const URL = "/api/agents/aria/generate";

describe("POST /api/agents/aria/generate", () => {
  it("returns a data: URL image on the happy path", async () => {
    // 1x1 transparent JPEG-ish buffer; the route base64-encodes whatever
    // the upstream returns, the bytes themselves don't matter here.
    const fakeImg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const upstream = new Response(fakeImg, {
      status: 200,
      headers: { "content-type": "image/jpeg" },
    });
    mockFetch(upstream);

    const { POST } = await import("@/app/api/agents/aria/generate/route");
    const res = await POST(
      buildRequest(URL, { method: "POST", body: { prompt: "a cat" } }),
    );
    const body = await expectJson<{ imageUrl: string }>(res, 200);
    expect(body.imageUrl).toMatch(/^data:image\/jpeg;base64,/);
    expect(getUserId).toHaveBeenCalled();
    expect(rateLimit).toHaveBeenCalledWith(
      "aria:generate:user_test",
      10,
      60_000,
    );
  });

  it("returns 503 when HF_TOKEN is not configured", async () => {
    vi.stubEnv("HF_TOKEN", "");
    const { POST } = await import("@/app/api/agents/aria/generate/route");
    const res = await POST(
      buildRequest(URL, { method: "POST", body: { prompt: "a cat" } }),
    );
    const body = await expectJson<{ error: string }>(res, 503);
    expect(body.error).toMatch(/HF_TOKEN not configured/);
  });

  it("returns 429 with Retry-After when the rate limiter rejects", async () => {
    rateLimit.mockReturnValue({ allowed: false, retryAfterSeconds: 42 });
    const { POST } = await import("@/app/api/agents/aria/generate/route");
    const res = await POST(
      buildRequest(URL, { method: "POST", body: { prompt: "a cat" } }),
    );
    const body = await expectJson<{ error: string }>(res, 429);
    expect(body.error).toMatch(/Too many requests/);
    expect(res.headers.get("Retry-After")).toBe("42");
  });

  it("returns 400 when the JSON body is malformed", async () => {
    const { POST } = await import("@/app/api/agents/aria/generate/route");
    const res = await POST(
      buildRequest(URL, { method: "POST", body: "{not json" }),
    );
    const body = await expectJson<{ error: string }>(res, 400);
    expect(body.error).toMatch(/invalid JSON body/);
  });

  it("returns 400 when prompt is missing or not a string", async () => {
    const { POST } = await import("@/app/api/agents/aria/generate/route");
    const res = await POST(
      buildRequest(URL, { method: "POST", body: { prompt: 123 } }),
    );
    const body = await expectJson<{ error: string }>(res, 400);
    expect(body.error).toMatch(/prompt is required/);
  });

  it("returns 400 when prompt exceeds MAX_PROMPT_LENGTH (2000)", async () => {
    const { POST } = await import("@/app/api/agents/aria/generate/route");
    const res = await POST(
      buildRequest(URL, {
        method: "POST",
        body: { prompt: "x".repeat(2001) },
      }),
    );
    const body = await expectJson<{ error: string }>(res, 400);
    expect(body.error).toMatch(/prompt exceeds/);
  });

  it("returns 503 with a warming-up message when HF reports loading", async () => {
    const upstream = new Response(
      JSON.stringify({
        error: "Model is currently loading",
        estimated_time: 30,
      }),
      {
        status: 503,
        headers: { "content-type": "application/json" },
      },
    );
    mockFetch(upstream);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { POST } = await import("@/app/api/agents/aria/generate/route");
    const res = await POST(
      buildRequest(URL, { method: "POST", body: { prompt: "a cat" } }),
    );
    const body = await expectJson<{ error: string; estimated_time: number }>(
      res,
      503,
    );
    expect(body.error).toMatch(/warming up/);
    expect(body.estimated_time).toBe(30);
  });

  it("returns 500 (or 502) safely on a generic HF error without leaking upstream body", async () => {
    const upstream = new Response(
      JSON.stringify({ error: "internal secret HF detail" }),
      {
        status: 500,
        headers: { "content-type": "application/json" },
      },
    );
    mockFetch(upstream);
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { POST } = await import("@/app/api/agents/aria/generate/route");
    const res = await POST(
      buildRequest(URL, { method: "POST", body: { prompt: "a cat" } }),
    );
    const probe = await res.clone().text();
    // Route maps 5xx -> 502, others -> 500. Either is acceptable; assert
    // both the safe-error wording AND that the upstream detail did not
    // leak through.
    expect([500, 502]).toContain(res.status);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/Image generation failed/);
    expect(probe).not.toMatch(/internal secret HF detail/);
  });
});
