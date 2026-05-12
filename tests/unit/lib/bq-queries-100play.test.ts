// Layer 2 (backend lib unit). File under test: src/lib/bq-queries-100play.ts. Priority: P0.
// 100play is the lumen-union path. Spend-only, no installs/network/campaign
// columns. The SQL must reach the right table and the allowlist guard must
// still fire before any query is dispatched.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({
  unstable_cache: <T extends (...args: unknown[]) => unknown>(fn: T) => fn,
}));

const queryFn = vi.fn();

vi.mock("@google-cloud/bigquery", () => {
  class BigQuery {
    query(opts: unknown) {
      return queryFn(opts);
    }
  }
  return { BigQuery };
});

beforeEach(() => {
  queryFn.mockReset();
  vi.stubEnv("BQ_PROJECT", "test-project");
  vi.stubEnv("BQ_DATASET", "test_dataset");
  vi.stubEnv("ALLOWED_CLIENTS", "globalcomix,playw3,100play");
  vi.stubEnv("GOOGLE_APPLICATION_CREDENTIALS_JSON", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("bq-queries-100play: client guard", () => {
  it("rejects an unknown client before any SQL is sent", async () => {
    const { query100playKPIs } = await import("@/lib/bq-queries-100play");
    await expect(
      query100playKPIs("evil_client", "2026-05-01", "2026-05-12"),
    ).rejects.toThrow(/not permitted|forbidden/i);
    expect(queryFn).not.toHaveBeenCalled();
  });

  it("rejects an invalid ISO date before any SQL is sent", async () => {
    const { query100playKPIs, query100playTrend } = await import(
      "@/lib/bq-queries-100play"
    );
    const { InvalidDateError } = await import("@/lib/bq-queries");
    await expect(
      query100playKPIs("100play", "bad-date", "2026-05-12"),
    ).rejects.toThrow(InvalidDateError);
    await expect(
      query100playTrend("100play", "2026-05-01", "bad-date"),
    ).rejects.toThrow(InvalidDateError);
    expect(queryFn).not.toHaveBeenCalled();
  });
});

describe("bq-queries-100play: SQL shape", () => {
  it("KPI query targets the dwh_fb2_ios14_appsflyer_100play primary table", async () => {
    queryFn.mockResolvedValue([[{}]]);
    const { query100playKPIs } = await import("@/lib/bq-queries-100play");
    await query100playKPIs("100play", "2026-05-01", "2026-05-12");
    const opts = queryFn.mock.calls[0][0] as { query: string; params: object };
    expect(opts.query).toContain(
      "`test-project.test_dataset.dwh_fb2_ios14_appsflyer_100play`",
    );
    expect(opts.query).toContain("SUM(cost_usd)");
    expect(opts.params).toMatchObject({
      from: "2026-05-01",
      to: "2026-05-12",
      prev_from: expect.any(String),
      prev_to: expect.any(String),
    });
  });

  it("KPI query is spend-only: installs / cpi are CAST(NULL)", async () => {
    queryFn.mockResolvedValue([[{}]]);
    const { query100playKPIs } = await import("@/lib/bq-queries-100play");
    await query100playKPIs("100play", "2026-05-01", "2026-05-12");
    const opts = queryFn.mock.calls[0][0] as { query: string };
    expect(opts.query).toContain("CAST(NULL AS INT64)");
    expect(opts.query).toContain("CAST(NULL AS FLOAT64)");
    expect(opts.query).not.toContain("SUM(installs)");
  });

  it("Trend query orders ascending by date and groups by date column", async () => {
    queryFn.mockResolvedValue([[]]);
    const { query100playTrend } = await import("@/lib/bq-queries-100play");
    await query100playTrend("100play", "2026-05-01", "2026-05-12");
    const opts = queryFn.mock.calls[0][0] as { query: string };
    expect(opts.query).toContain("GROUP BY 1");
    expect(opts.query).toContain("ORDER BY 1 ASC");
  });
});

describe("bq-queries-100play: channel-mix synthesis", () => {
  it("returns a single Meta row when spend > 0 (no network column upstream)", async () => {
    queryFn.mockResolvedValue([[{ spend: 12345 }]]);
    const { query100playChannelMix } = await import(
      "@/lib/bq-queries-100play"
    );
    const out = await query100playChannelMix(
      "100play",
      "2026-05-01",
      "2026-05-12",
    );
    expect(out).toEqual([{ network: "Meta", spend: 12345, share: 1 }]);
  });

  it("returns an empty list when spend is zero", async () => {
    queryFn.mockResolvedValue([[{ spend: 0 }]]);
    const { query100playChannelMix } = await import(
      "@/lib/bq-queries-100play"
    );
    const out = await query100playChannelMix(
      "100play",
      "2026-05-01",
      "2026-05-12",
    );
    expect(out).toEqual([]);
  });
});

describe("bq-queries-100play: campaigns", () => {
  it("returns an empty list without sending SQL (no campaign columns upstream)", async () => {
    const { query100playCampaigns } = await import(
      "@/lib/bq-queries-100play"
    );
    const out = await query100playCampaigns(
      "100play",
      "2026-05-01",
      "2026-05-12",
    );
    expect(out).toEqual([]);
    expect(queryFn).not.toHaveBeenCalled();
  });

  it("still enforces the allowlist even though it returns empty", async () => {
    const { query100playCampaigns } = await import(
      "@/lib/bq-queries-100play"
    );
    await expect(
      query100playCampaigns("evil_client", "2026-05-01", "2026-05-12"),
    ).rejects.toThrow();
  });
});

describe("bq-queries-100play: data-bounds", () => {
  it("filters to rows with cost_usd > 0", async () => {
    queryFn.mockResolvedValue([
      [{ earliest: "2023-09-27", latest: "2026-05-10" }],
    ]);
    const { query100playDataBounds } = await import(
      "@/lib/bq-queries-100play"
    );
    const out = await query100playDataBounds("100play");
    const opts = queryFn.mock.calls[0][0] as { query: string };
    expect(opts.query).toContain("cost_usd IS NOT NULL");
    expect(opts.query).toContain("cost_usd > 0");
    expect(out).toEqual({ earliest: "2023-09-27", latest: "2026-05-10" });
  });
});
