// Layer 2 (backend lib unit). File under test: src/lib/bq.ts. Priority: P0.
// Singleton BigQuery client. Credential parsing failures must throw with a
// helpful message; the missing-creds fallback must still construct a client.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@google-cloud/bigquery", () => {
  class BigQuery {
    public projectId: string;
    public credentials: unknown;
    constructor(opts: { projectId: string; credentials?: unknown }) {
      this.projectId = opts.projectId;
      this.credentials = opts.credentials;
    }
  }
  return { BigQuery };
});

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("BQ_PROJECT", "test-project");
  vi.stubEnv("BQ_DATASET", "test_dataset");
  vi.stubEnv("ALLOWED_CLIENTS", "globalcomix");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getBigQueryClient", () => {
  it("returns a BigQuery client with the project id from env (ADC fallback)", async () => {
    vi.stubEnv("GOOGLE_APPLICATION_CREDENTIALS_JSON", "");
    const { getBigQueryClient } = await import("@/lib/bq");
    const bq = getBigQueryClient() as unknown as { projectId: string; credentials: unknown };
    expect(bq.projectId).toBe("test-project");
    expect(bq.credentials).toBeUndefined();
  });

  it("decodes base64 service-account JSON when present", async () => {
    const creds = { client_email: "svc@x.iam", private_key: "-----PRIVATE-----" };
    const b64 = Buffer.from(JSON.stringify(creds), "utf-8").toString("base64");
    vi.stubEnv("GOOGLE_APPLICATION_CREDENTIALS_JSON", b64);
    const { getBigQueryClient } = await import("@/lib/bq");
    const bq = getBigQueryClient() as unknown as { credentials: typeof creds };
    expect(bq.credentials).toEqual(creds);
  });

  it("throws a helpful error when the env value is not valid base64-JSON", async () => {
    vi.stubEnv("GOOGLE_APPLICATION_CREDENTIALS_JSON", "not-base64-and-not-json");
    const { getBigQueryClient } = await import("@/lib/bq");
    expect(() => getBigQueryClient()).toThrow(/base64-encoded JSON/);
  });

  it("returns the same singleton across calls", async () => {
    vi.stubEnv("GOOGLE_APPLICATION_CREDENTIALS_JSON", "");
    const { getBigQueryClient } = await import("@/lib/bq");
    const a = getBigQueryClient();
    const b = getBigQueryClient();
    expect(a).toBe(b);
  });
});
