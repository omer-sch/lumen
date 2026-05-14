// Layer 2 (lib unit). File under test: src/lib/rate-limit.ts. Priority: P1.
// In-memory sliding-window limiter sitting in front of paid third-party
// APIs. Tests cover burst-up-to-limit, refill after the window slides, key
// isolation, and the retry-after seconds calculation. Real timers stay off
// so a slow CI box doesn't flake the millisecond math.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-05-14T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("rateLimit: burst behavior", () => {
  it("allows up to maxRequests inside the window", async () => {
    const { rateLimit } = await import("@/lib/rate-limit");
    const a = rateLimit("burst-1", 3, 60_000);
    const b = rateLimit("burst-1", 3, 60_000);
    const c = rateLimit("burst-1", 3, 60_000);
    expect(a.allowed).toBe(true);
    expect(b.allowed).toBe(true);
    expect(c.allowed).toBe(true);
  });

  it("decrements remaining on each allowed call", async () => {
    const { rateLimit } = await import("@/lib/rate-limit");
    const a = rateLimit("remaining", 3, 60_000);
    const b = rateLimit("remaining", 3, 60_000);
    const c = rateLimit("remaining", 3, 60_000);
    if (!a.allowed || !b.allowed || !c.allowed) {
      throw new Error("expected allowed");
    }
    expect(a.remaining).toBe(2);
    expect(b.remaining).toBe(1);
    expect(c.remaining).toBe(0);
  });

  it("rejects the call that exceeds maxRequests with retryAfterSeconds", async () => {
    const { rateLimit } = await import("@/lib/rate-limit");
    rateLimit("over", 2, 60_000);
    rateLimit("over", 2, 60_000);
    const over = rateLimit("over", 2, 60_000);
    expect(over.allowed).toBe(false);
    if (over.allowed) throw new Error();
    expect(over.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(over.retryAfterSeconds).toBeLessThanOrEqual(60);
  });
});

describe("rateLimit: window slides", () => {
  it("refills the budget after the window passes", async () => {
    const { rateLimit } = await import("@/lib/rate-limit");
    rateLimit("slide", 2, 60_000);
    rateLimit("slide", 2, 60_000);
    expect(rateLimit("slide", 2, 60_000).allowed).toBe(false);

    // Advance past the window — old hits fall out, the next call is fresh.
    vi.advanceTimersByTime(60_001);
    expect(rateLimit("slide", 2, 60_000).allowed).toBe(true);
  });

  it("retryAfterSeconds counts down as time passes", async () => {
    const { rateLimit } = await import("@/lib/rate-limit");
    rateLimit("countdown", 1, 60_000);
    const r1 = rateLimit("countdown", 1, 60_000);
    if (r1.allowed) throw new Error("expected rejection");
    expect(r1.retryAfterSeconds).toBe(60);

    vi.advanceTimersByTime(30_000);
    const r2 = rateLimit("countdown", 1, 60_000);
    if (r2.allowed) throw new Error("expected rejection");
    expect(r2.retryAfterSeconds).toBe(30);
  });
});

describe("rateLimit: key isolation", () => {
  it("buckets are per-key — hitting one does not exhaust another", async () => {
    const { rateLimit } = await import("@/lib/rate-limit");
    rateLimit("user-a", 1, 60_000);
    expect(rateLimit("user-a", 1, 60_000).allowed).toBe(false);
    // user-b has its own bucket and is untouched.
    expect(rateLimit("user-b", 1, 60_000).allowed).toBe(true);
  });

  it("retryAfterSeconds is at least 1 second (never zero)", async () => {
    const { rateLimit } = await import("@/lib/rate-limit");
    rateLimit("min-floor", 1, 100); // 100ms window
    // Inside the same millisecond, the math could compute < 1s before the
    // Math.max(1, ...) floor. The floor must kick in.
    const r = rateLimit("min-floor", 1, 100);
    if (r.allowed) throw new Error();
    expect(r.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });
});
