// Layer 2 (frontend lib unit). File under test:
// src/lib/campaigns/use-campaign-profile.ts. Priority: P1.
//
// React-bound hook — uses renderHook + a stubbed fetch to observe
// URL shape and state transitions through loading / data / empty / error.

import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useCampaignProfile } from "@/lib/campaigns/use-campaign-profile";
import type { CampaignProfileData } from "@/types/dashboard";

const EMPTY_PAYLOAD: CampaignProfileData = {
  summary: null,
  trend: [],
  adsets: [],
  creatives: [],
  geo: [],
};

describe("useCampaignProfile", () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  let calls: string[] = [];

  beforeEach(() => {
    calls = [];
    fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      calls.push(String(url));
      return new Response(JSON.stringify(EMPTY_PAYLOAD), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  const FROM = new Date(Date.UTC(2026, 3, 15));
  const TO = new Date(Date.UTC(2026, 4, 14));

  it("hits the profile route with the campaign id and date params", async () => {
    renderHook(() =>
      useCampaignProfile({
        campaignId: "12345",
        from: FROM,
        to: TO,
        client: "globalcomix",
      }),
    );
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    expect(calls[0]).toContain("/api/bq/campaigns/12345/profile?");
    expect(calls[0]).toContain("client=globalcomix");
    expect(calls[0]).toContain("from=2026-04-15");
    expect(calls[0]).toContain("to=2026-05-14");
    // OS / Platforms must NOT thread through (route hides them anyway).
    expect(calls[0]).not.toMatch(/[?&]os=/);
    expect(calls[0]).not.toMatch(/[?&]platforms=/);
  });

  it("url-encodes a campaignId with special chars", async () => {
    renderHook(() =>
      useCampaignProfile({
        campaignId: "abc/123 with space",
        from: FROM,
        to: TO,
        client: "globalcomix",
      }),
    );
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    // encodeURIComponent turns / into %2F and space into %20.
    expect(calls[0]).toContain("/api/bq/campaigns/abc%2F123%20with%20space/profile");
  });

  it("resolves empty payload as data with summary=null (not an error)", async () => {
    const { result } = renderHook(() =>
      useCampaignProfile({
        campaignId: "unknown",
        from: FROM,
        to: TO,
        client: "globalcomix",
      }),
    );
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.error).toBeNull();
    expect(result.current.data?.summary).toBeNull();
    expect(result.current.data?.adsets).toEqual([]);
  });

  it("surfaces a top-level error string when the route 500s", async () => {
    fetchSpy.mockImplementationOnce(
      async () =>
        new Response(JSON.stringify({ error: "boom" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        }),
    );
    const { result } = renderHook(() =>
      useCampaignProfile({
        campaignId: "12345",
        from: FROM,
        to: TO,
        client: "globalcomix",
      }),
    );
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toContain("500");
    expect(result.current.data).toBeNull();
  });

  it("changing campaignId triggers a new fetch", async () => {
    const { rerender } = renderHook(
      ({ campaignId }: { campaignId: string }) =>
        useCampaignProfile({
          campaignId,
          from: FROM,
          to: TO,
          client: "globalcomix",
        }),
      { initialProps: { campaignId: "12345" } },
    );
    await waitFor(() => expect(calls.length).toBeGreaterThan(0));
    const before = calls.length;
    rerender({ campaignId: "99999" });
    await waitFor(() => expect(calls.length).toBeGreaterThan(before));
    expect(calls.slice(before)[0]).toContain("/api/bq/campaigns/99999/profile");
  });
});
