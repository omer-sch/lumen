// Layer 2 (lib unit). File under test:
// src/lib/agents/_scaffold/auth.ts. Verifies the 401 / 429 / ok paths
// and the per-agent rate-limit key shape.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.hoisted(() => vi.fn());
const rateLimitMock = vi.hoisted(() => vi.fn());

vi.mock("@clerk/nextjs/server", () => ({ auth: authMock }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: rateLimitMock }));

beforeEach(() => {
  authMock.mockReset();
  rateLimitMock.mockReset();
  rateLimitMock.mockReturnValue({ allowed: true, remaining: 29 });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("requireAgentAuth", () => {
  it("returns 401 when there is no Clerk session", async () => {
    authMock.mockResolvedValue({ userId: null });
    const { requireAgentAuth } = await import(
      "@/lib/agents/_scaffold/auth"
    );
    const r = await requireAgentAuth("hermes");
    expect(r).toEqual({ ok: false, status: 401, error: "Unauthorized" });
    expect(rateLimitMock).not.toHaveBeenCalled();
  });

  it("returns ok with userId when signed in and under the limit", async () => {
    authMock.mockResolvedValue({ userId: "user_42" });
    const { requireAgentAuth } = await import(
      "@/lib/agents/_scaffold/auth"
    );
    const r = await requireAgentAuth("hermes");
    expect(r).toEqual({ ok: true, userId: "user_42" });
    expect(rateLimitMock).toHaveBeenCalledWith(
      "agent:hermes:user_42",
      30,
      5 * 60 * 1000,
    );
  });

  it("returns 429 with retryAfterSeconds when the limiter rejects", async () => {
    authMock.mockResolvedValue({ userId: "user_42" });
    rateLimitMock.mockReturnValue({
      allowed: false,
      retryAfterSeconds: 90,
    });
    const { requireAgentAuth } = await import(
      "@/lib/agents/_scaffold/auth"
    );
    const r = await requireAgentAuth("hermes");
    expect(r).toMatchObject({
      ok: false,
      status: 429,
      retryAfterSeconds: 90,
    });
    if (r.ok === false && r.status === 429) {
      expect(r.error).toMatch(/Retry in 90s/);
    }
  });

  it("respects custom maxPerWindow + windowMs", async () => {
    authMock.mockResolvedValue({ userId: "user_42" });
    const { requireAgentAuth } = await import(
      "@/lib/agents/_scaffold/auth"
    );
    await requireAgentAuth("hermes", {
      maxPerWindow: 5,
      windowMs: 60_000,
    });
    expect(rateLimitMock).toHaveBeenCalledWith(
      "agent:hermes:user_42",
      5,
      60_000,
    );
  });

  it("isolates rate-limit keys per agent (different agents do not share buckets)", async () => {
    authMock.mockResolvedValue({ userId: "user_42" });
    const { requireAgentAuth } = await import(
      "@/lib/agents/_scaffold/auth"
    );
    await requireAgentAuth("hermes");
    await requireAgentAuth("aria");
    expect(rateLimitMock.mock.calls.map((c) => c[0])).toEqual([
      "agent:hermes:user_42",
      "agent:aria:user_42",
    ]);
  });
});
