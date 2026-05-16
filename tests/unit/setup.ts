import "@testing-library/jest-dom/vitest";
import { vi, beforeEach } from "vitest";

// LangSmith tracing must never fire from a unit run (would phone home
// to app.smith.langchain.com on every test). Force off explicitly;
// the traceable() wrappers in src/lib/agents/_scaffold/model.ts and
// the BQ wrappers in nodes/analyze.ts become no-ops.
process.env.LANGSMITH_TRACING = "false";
delete process.env.LANGSMITH_API_KEY;

// ResizeObserver: Recharts and Radix-style measurers need it.
class MockResizeObserver {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
(globalThis as unknown as { ResizeObserver: typeof MockResizeObserver }).ResizeObserver =
  MockResizeObserver;

// matchMedia: dark / light theme media queries during render.
if (typeof window !== "undefined" && !window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

// next/navigation defaults. Individual tests can re-mock per-case.
vi.mock("next/navigation", () => {
  const replace = vi.fn();
  const push = vi.fn();
  const refresh = vi.fn();
  return {
    useRouter: () => ({ replace, push, refresh, back: vi.fn(), forward: vi.fn() }),
    usePathname: () => "/dashboard",
    useSearchParams: () => new URLSearchParams(),
    redirect: vi.fn(),
    notFound: vi.fn(),
  };
});

// Clerk: client and server entrypoints used across the app.
vi.mock("@clerk/nextjs", () => ({
  ClerkProvider: ({ children }: { children: React.ReactNode }) => children,
  SignedIn: ({ children }: { children: React.ReactNode }) => children,
  SignedOut: () => null,
  useAuth: () => ({ isSignedIn: true, userId: "user_test", isLoaded: true }),
  useUser: () => ({
    isSignedIn: true,
    isLoaded: true,
    user: { id: "user_test", firstName: "Test", primaryEmailAddress: { emailAddress: "test@example.com" } },
  }),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: async () => ({ userId: "user_test" }),
  clerkMiddleware: () => () => undefined,
  createRouteMatcher: () => () => false,
}));

beforeEach(() => {
  if (typeof window !== "undefined") {
    // Vitest 4 ships its own localStorage proxy that may not expose `clear()`.
    // Walk the keys instead, and silently no-op if storage is missing.
    try {
      if (window.localStorage && typeof window.localStorage.clear === "function") {
        window.localStorage.clear();
      } else if (window.localStorage) {
        for (let i = window.localStorage.length - 1; i >= 0; i--) {
          const k = window.localStorage.key(i);
          if (k) window.localStorage.removeItem(k);
        }
      }
    } catch {
      /* ignore */
    }
    try {
      if (window.sessionStorage && typeof window.sessionStorage.clear === "function") {
        window.sessionStorage.clear();
      }
    } catch {
      /* ignore */
    }
  }
});
