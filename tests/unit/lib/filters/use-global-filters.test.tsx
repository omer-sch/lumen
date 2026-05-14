// Layer 1 (frontend hook). File under test: src/lib/filters/use-global-filters.ts.
// Priority: P1.
// Global filter state is mirrored into URL search params so deep links
// reproduce a view exactly. The hook reads useSearchParams() and writes via
// router.replace(). Tests cover defaults, preset switching, custom-range
// writes, and the client selector's "default-is-cleared" behavior.
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Stateful mock for next/navigation so each test can vary the search params
// independently. vi.hoisted lets the factory reference shared state because
// vi.mock factories are evaluated before any top-level `let`.
const nav = vi.hoisted(() => {
  let current = new URLSearchParams();
  return {
    setParams: (qs: string) => {
      current = new URLSearchParams(qs);
    },
    getParams: () => current,
    replace: vi.fn(),
    push: vi.fn(),
    refresh: vi.fn(),
  };
});

vi.mock("next/navigation", () => ({
  useSearchParams: () => nav.getParams(),
  useRouter: () => ({
    replace: nav.replace,
    push: nav.push,
    refresh: nav.refresh,
    back: vi.fn(),
    forward: vi.fn(),
  }),
  usePathname: () => "/dashboard",
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

beforeEach(() => {
  nav.setParams("");
  nav.replace.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

describe("useGlobalFilters: defaults", () => {
  it("defaults to range=30d, client=globalcomix when no params are present", async () => {
    const { useGlobalFilters } = await import(
      "@/lib/filters/use-global-filters"
    );
    const { result } = renderHook(() => useGlobalFilters());
    expect(result.current.range).toBe("30d");
    expect(result.current.client).toBe("globalcomix");
  });

  it("derives a 30-day window from today when no from/to are present", async () => {
    const { useGlobalFilters, windowDays } = await import(
      "@/lib/filters/use-global-filters"
    );
    const { result } = renderHook(() => useGlobalFilters());
    expect(windowDays(result.current)).toBe(30);
  });

  it("accepts each preset", async () => {
    const { useGlobalFilters, windowDays } = await import(
      "@/lib/filters/use-global-filters"
    );
    for (const [preset, days] of [
      ["7d", 7],
      ["14d", 14],
      ["30d", 30],
      ["90d", 90],
    ] as const) {
      nav.setParams(`range=${preset}`);
      const { result } = renderHook(() => useGlobalFilters());
      expect(result.current.range).toBe(preset);
      expect(windowDays(result.current)).toBe(days);
    }
  });

  it("falls back to 30d when range is not a known preset", async () => {
    nav.setParams("range=bogus");
    const { useGlobalFilters } = await import(
      "@/lib/filters/use-global-filters"
    );
    const { result } = renderHook(() => useGlobalFilters());
    expect(result.current.range).toBe("30d");
  });

  it("respects ?client=acme overriding the default", async () => {
    nav.setParams("client=acme");
    const { useGlobalFilters } = await import(
      "@/lib/filters/use-global-filters"
    );
    const { result } = renderHook(() => useGlobalFilters());
    expect(result.current.client).toBe("acme");
  });
});

describe("useGlobalFilters: custom range", () => {
  it("reads from/to verbatim when range=custom", async () => {
    nav.setParams("range=custom&from=2026-01-01&to=2026-02-01");
    const { useGlobalFilters } = await import(
      "@/lib/filters/use-global-filters"
    );
    const { result } = renderHook(() => useGlobalFilters());
    expect(isoDate(result.current.from)).toBe("2026-01-01");
    expect(isoDate(result.current.to)).toBe("2026-02-01");
  });

  it("backfills from/to with sensible defaults if range=custom but params are missing", async () => {
    nav.setParams("range=custom");
    const { useGlobalFilters, windowDays } = await import(
      "@/lib/filters/use-global-filters"
    );
    const { result } = renderHook(() => useGlobalFilters());
    // 31 days inclusive (today + 30 prior).
    expect(windowDays(result.current)).toBe(31);
  });
});

describe("useGlobalFilters: setters write to the URL", () => {
  it("setRange('7d') writes range=7d and clears any from/to", async () => {
    nav.setParams("range=custom&from=2026-01-01&to=2026-02-01");
    const { useGlobalFilters } = await import(
      "@/lib/filters/use-global-filters"
    );
    const { result } = renderHook(() => useGlobalFilters());

    act(() => result.current.setRange("7d"));
    expect(nav.replace).toHaveBeenCalledTimes(1);
    const url = nav.replace.mock.calls[0][0] as string;
    expect(url).toMatch(/range=7d/);
    expect(url).not.toMatch(/from=/);
    expect(url).not.toMatch(/to=/);
  });

  it("setRange('custom') seeds from/to to last-30-days when neither exist", async () => {
    const { useGlobalFilters } = await import(
      "@/lib/filters/use-global-filters"
    );
    const { result } = renderHook(() => useGlobalFilters());

    act(() => result.current.setRange("custom"));
    const url = nav.replace.mock.calls[0][0] as string;
    expect(url).toMatch(/range=custom/);
    expect(url).toMatch(/from=\d{4}-\d{2}-\d{2}/);
    expect(url).toMatch(/to=\d{4}-\d{2}-\d{2}/);
  });

  it("setCustomRange writes range=custom and the explicit dates", async () => {
    const { useGlobalFilters } = await import(
      "@/lib/filters/use-global-filters"
    );
    const { result } = renderHook(() => useGlobalFilters());

    act(() =>
      result.current.setCustomRange(
        new Date("2026-03-01T00:00:00Z"),
        new Date("2026-03-15T00:00:00Z"),
      ),
    );
    const url = nav.replace.mock.calls[0][0] as string;
    expect(url).toMatch(/range=custom/);
    expect(url).toMatch(/from=2026-03-01/);
    expect(url).toMatch(/to=2026-03-15/);
  });

  it("setClient(default) clears the client param instead of writing it", async () => {
    nav.setParams("client=acme&range=14d");
    const { useGlobalFilters } = await import(
      "@/lib/filters/use-global-filters"
    );
    const { result } = renderHook(() => useGlobalFilters());

    act(() => result.current.setClient("globalcomix"));
    const url = nav.replace.mock.calls[0][0] as string;
    expect(url).not.toMatch(/client=/);
    expect(url).toMatch(/range=14d/);
  });

  it("setClient(slug) writes the client param", async () => {
    const { useGlobalFilters } = await import(
      "@/lib/filters/use-global-filters"
    );
    const { result } = renderHook(() => useGlobalFilters());

    act(() => result.current.setClient("playw3"));
    const url = nav.replace.mock.calls[0][0] as string;
    expect(url).toMatch(/client=playw3/);
  });
});

describe("previousWindow", () => {
  it("shifts the same-length window backwards by its length", async () => {
    const { previousWindow, windowDays } = await import(
      "@/lib/filters/use-global-filters"
    );
    const f = {
      from: new Date("2026-05-01T00:00:00Z"),
      to: new Date("2026-05-07T00:00:00Z"),
    };
    expect(windowDays(f)).toBe(7);
    const prev = previousWindow(f);
    expect(isoDate(prev.from)).toBe("2026-04-24");
    expect(isoDate(prev.to)).toBe("2026-04-30");
  });
});
