// Layer 1 (frontend hook). File under test: src/lib/filters/use-dashboard-mode.ts.
// Priority: P2.
// The dashboard's "My / AI" toggle is URL-backed (?mode=ai). Deep links must
// reproduce the AI view; flipping back to "my" drops the param entirely.
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const nav = vi.hoisted(() => {
  let current = new URLSearchParams();
  return {
    setParams: (qs: string) => {
      current = new URLSearchParams(qs);
    },
    getParams: () => current,
    replace: vi.fn(),
  };
});

vi.mock("next/navigation", () => ({
  useSearchParams: () => nav.getParams(),
  useRouter: () => ({
    replace: nav.replace,
    push: vi.fn(),
    refresh: vi.fn(),
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

describe("useDashboardMode", () => {
  it("defaults to 'my' when no mode param is present", async () => {
    const { useDashboardMode } = await import(
      "@/lib/filters/use-dashboard-mode"
    );
    const { result } = renderHook(() => useDashboardMode());
    expect(result.current.mode).toBe("my");
  });

  it("reads mode=ai from the URL", async () => {
    nav.setParams("mode=ai");
    const { useDashboardMode } = await import(
      "@/lib/filters/use-dashboard-mode"
    );
    const { result } = renderHook(() => useDashboardMode());
    expect(result.current.mode).toBe("ai");
  });

  it("treats any value other than 'ai' as 'my'", async () => {
    nav.setParams("mode=bogus");
    const { useDashboardMode } = await import(
      "@/lib/filters/use-dashboard-mode"
    );
    const { result } = renderHook(() => useDashboardMode());
    expect(result.current.mode).toBe("my");
  });

  it("setMode('ai') writes mode=ai to the URL", async () => {
    const { useDashboardMode } = await import(
      "@/lib/filters/use-dashboard-mode"
    );
    const { result } = renderHook(() => useDashboardMode());

    act(() => result.current.setMode("ai"));
    expect(nav.replace).toHaveBeenCalledTimes(1);
    expect(nav.replace.mock.calls[0][0]).toMatch(/mode=ai/);
  });

  it("setMode('my') clears the param entirely (default is implicit)", async () => {
    nav.setParams("mode=ai&range=7d");
    const { useDashboardMode } = await import(
      "@/lib/filters/use-dashboard-mode"
    );
    const { result } = renderHook(() => useDashboardMode());

    act(() => result.current.setMode("my"));
    const url = nav.replace.mock.calls[0][0] as string;
    expect(url).not.toMatch(/mode=/);
    // Other params are preserved.
    expect(url).toMatch(/range=7d/);
  });

  it("setMode writes via router.replace with { scroll: false }", async () => {
    const { useDashboardMode } = await import(
      "@/lib/filters/use-dashboard-mode"
    );
    const { result } = renderHook(() => useDashboardMode());
    act(() => result.current.setMode("ai"));
    expect(nav.replace.mock.calls[0][1]).toEqual({ scroll: false });
  });
});
