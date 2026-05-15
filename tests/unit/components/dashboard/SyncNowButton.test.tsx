// Layer 4 (frontend component). File under test:
// src/components/dashboard/SyncNowButton.tsx.
//
// The button is the only admin-facing surface in the cache subsystem. It
// must:
//   1. Stay hidden for non-admin sessions (a UX nicety; the server route
//      enforces the same gate independently — see refresh.test.ts).
//   2. Render and be clickable for admin sessions.
//   3. POST /api/cache/refresh?client=<active>, show a loading state,
//      show success/error indicators, and call router.refresh() on
//      success so the dashboard re-fetches.
//
// Notes on coverage: this file under test was previously excluded from v8
// coverage by a project-wide TSX parser issue (every dashboard component
// hits the same exclusion). The exclusion does not affect test execution —
// behavioral assertions still run and protect the surface.
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const nav = vi.hoisted(() => ({
  refresh: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: nav.refresh,
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
  }),
}));

vi.mock("@/lib/filters/use-global-filters", () => ({
  useGlobalFilters: () => ({ client: "globalcomix" }),
}));

import { SyncNowButton } from "@/components/dashboard/SyncNowButton";

// Per-test handle for global fetch. We swap the implementation between
// "isAdmin response" and "refresh response" cases.
const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  nav.refresh.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * Stand up a default fetch dispatch that branches on URL: the admin
 * probe answers `{ isAdmin }`; the refresh POST answers `{ dataAsOf,
 * warmedQueries, ... }`. Individual tests can override per-case.
 */
function wireFetch(opts: {
  isAdmin: boolean;
  refresh?:
    | { ok: true; body: Record<string, unknown> }
    | { ok: false; status: number; body: Record<string, unknown> };
}) {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.startsWith("/api/me/admin")) {
      return new Response(JSON.stringify({ isAdmin: opts.isAdmin }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url.startsWith("/api/cache/refresh")) {
      if (!init || init.method !== "POST") {
        throw new Error(`Unexpected method on /api/cache/refresh: ${init?.method}`);
      }
      const r = opts.refresh ?? {
        ok: true as const,
        body: { dataAsOf: "2026-05-14", warmedQueries: 7 },
      };
      return new Response(JSON.stringify(r.body), {
        status: r.ok ? 200 : r.status,
        headers: { "content-type": "application/json" },
      });
    }
    throw new Error(`Unexpected fetch URL: ${url}`);
  });
}

describe("SyncNowButton: visibility gate", () => {
  it("renders nothing while the admin probe is pending", () => {
    // Don't resolve fetch — leaves isAdmin in null state.
    fetchMock.mockImplementation(() => new Promise(() => {}));
    const { container } = render(<SyncNowButton />);
    expect(container.firstChild).toBeNull();
  });

  it("renders nothing for a non-admin session", async () => {
    wireFetch({ isAdmin: false });
    const { container } = render(<SyncNowButton />);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/me/admin",
        expect.objectContaining({ cache: "no-store" }),
      );
    });
    expect(container.querySelector('[data-testid="sync-now-button"]')).toBeNull();
  });

  it("renders the button for an admin session", async () => {
    wireFetch({ isAdmin: true });
    render(<SyncNowButton />);
    const btn = await screen.findByTestId("sync-now-button");
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveTextContent(/Sync now/i);
  });

  it("treats a /api/me/admin error as non-admin (fails closed)", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.startsWith("/api/me/admin")) {
        return new Response("nope", { status: 500 });
      }
      throw new Error(`Unexpected: ${url}`);
    });
    const { container } = render(<SyncNowButton />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(container.querySelector('[data-testid="sync-now-button"]')).toBeNull();
  });
});

describe("SyncNowButton: click → refresh round-trip", () => {
  it("POSTs to /api/cache/refresh with the active client and shows success", async () => {
    wireFetch({ isAdmin: true });
    const user = userEvent.setup();
    render(<SyncNowButton />);
    const btn = await screen.findByTestId("sync-now-button");

    await user.click(btn);

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/cache/refresh?client=globalcomix",
        expect.objectContaining({ method: "POST", cache: "no-store" }),
      ),
    );
    // Success indicator and router.refresh() both fire.
    const success = await screen.findByTestId("sync-now-success");
    expect(success).toHaveTextContent(/Synced\. Data current as of/);
    expect(nav.refresh).toHaveBeenCalledOnce();
  });

  it("shows a loading state while the refresh request is in flight", async () => {
    // Park the refresh promise so we can observe the in-flight state.
    let resolveRefresh: ((v: Response) => void) | null = null;
    fetchMock.mockImplementation((url: string) => {
      if (url.startsWith("/api/me/admin")) {
        return Promise.resolve(
          new Response(JSON.stringify({ isAdmin: true }), { status: 200 }),
        );
      }
      return new Promise<Response>((resolve) => {
        resolveRefresh = resolve;
      });
    });
    const user = userEvent.setup();
    render(<SyncNowButton />);
    const btn = await screen.findByTestId("sync-now-button");

    await user.click(btn);
    // Loading: label flips, button disabled.
    expect(btn).toHaveTextContent(/Syncing/i);
    expect(btn).toBeDisabled();

    // Resolve and confirm the success state lands.
    await act(async () => {
      resolveRefresh!(
        new Response(
          JSON.stringify({ dataAsOf: "2026-05-14", warmedQueries: 7 }),
          { status: 200 },
        ),
      );
    });
    await screen.findByTestId("sync-now-success");
  });

  it("surfaces a server error message and does NOT refresh the router", async () => {
    wireFetch({
      isAdmin: true,
      refresh: { ok: false, status: 500, body: { error: "Redis exploded" } },
    });
    const user = userEvent.setup();
    render(<SyncNowButton />);
    const btn = await screen.findByTestId("sync-now-button");

    await user.click(btn);

    const err = await screen.findByTestId("sync-now-error");
    expect(err).toHaveTextContent(/Redis exploded/);
    expect(nav.refresh).not.toHaveBeenCalled();
  });
});
