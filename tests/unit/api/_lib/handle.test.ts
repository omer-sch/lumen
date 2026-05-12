// Layer 3 (API route-handler unit). File under test: src/app/api/bq/_lib/handle.ts. Priority: P0.
// The error translator MUST never leak a raw BQ error message to the client.
// requireParams normalizes casing for `client` and rejects whitespace-only.
import { describe, expect, it, vi } from "vitest";

// Pass-through; handle.ts only uses NextResponse.json which works in jsdom.
describe("requireParams", () => {
  it("returns the normalized params when all are present", async () => {
    const { requireParams } = await import("@/app/api/bq/_lib/handle");
    const sp = new URLSearchParams({
      client: "GlobalComix",
      from: "2026-05-01",
      to: "2026-05-12",
    });
    const out = await requireParams(sp, ["client", "from", "to"]);
    if (out instanceof Response) throw new Error("expected params, not response");
    expect(out).toEqual({
      client: "globalcomix",
      from: "2026-05-01",
      to: "2026-05-12",
    });
  });

  it("returns a 400 NextResponse when a required param is missing", async () => {
    const { requireParams } = await import("@/app/api/bq/_lib/handle");
    const sp = new URLSearchParams({ client: "globalcomix", from: "2026-05-01" });
    const out = await requireParams(sp, ["client", "from", "to"]);
    expect(out).toBeInstanceOf(Response);
    if (!(out instanceof Response)) return;
    expect(out.status).toBe(400);
    const body = (await out.json()) as { error: string };
    expect(body.error).toContain("Missing required param: to");
  });

  it("rejects whitespace-only values as missing", async () => {
    const { requireParams } = await import("@/app/api/bq/_lib/handle");
    const sp = new URLSearchParams({ client: "  ", from: "2026-05-01", to: "2026-05-12" });
    const out = await requireParams(sp, ["client", "from", "to"]);
    expect(out).toBeInstanceOf(Response);
    if (!(out instanceof Response)) return;
    expect(out.status).toBe(400);
  });

  it("trims surrounding whitespace from non-empty values", async () => {
    const { requireParams } = await import("@/app/api/bq/_lib/handle");
    const sp = new URLSearchParams({
      client: " globalcomix ",
      from: " 2026-05-01 ",
      to: " 2026-05-12 ",
    });
    const out = await requireParams(sp, ["client", "from", "to"]);
    if (out instanceof Response) throw new Error("expected params");
    expect(out.client).toBe("globalcomix");
    expect(out.from).toBe("2026-05-01");
    expect(out.to).toBe("2026-05-12");
  });
});

describe("bqErrorResponse", () => {
  it("translates ClientNotPermittedError to a 403 Forbidden body", async () => {
    const { ClientNotPermittedError } = await import("@/lib/bq-security");
    const { bqErrorResponse } = await import("@/app/api/bq/_lib/handle");
    const res = bqErrorResponse(new ClientNotPermittedError("evil"), "test");
    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: string };
    expect(body).toEqual({ error: "Forbidden" });
    expect(body.error).not.toContain("evil");
  });

  it("translates UnknownClientTableError to a 403 Forbidden body", async () => {
    const { UnknownClientTableError } = await import("@/lib/bq-security");
    const { bqErrorResponse } = await import("@/app/api/bq/_lib/handle");
    const res = bqErrorResponse(new UnknownClientTableError("100play"), "test");
    expect(res.status).toBe(403);
  });

  it("translates InvalidDateError to a 400 Bad request body", async () => {
    const { InvalidDateError } = await import("@/lib/bq-queries");
    const { bqErrorResponse } = await import("@/app/api/bq/_lib/handle");
    const res = bqErrorResponse(new InvalidDateError("bad"), "test");
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body).toEqual({ error: "Bad request" });
  });

  it("translates any other error to a generic 500 without leaking the message", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { bqErrorResponse } = await import("@/app/api/bq/_lib/handle");
    const res = bqErrorResponse(
      new Error("BQ permission denied: revealing schema secrets.column_x"),
      "test",
    );
    expect(res.status).toBe(500);
    const body = (await res.json()) as { error: string };
    expect(body).toEqual({ error: "Query failed" });
    expect(body.error).not.toContain("schema");
    expect(body.error).not.toContain("column_x");
    consoleSpy.mockRestore();
  });

  it("never reflects a non-Error throw value to the client body", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { bqErrorResponse } = await import("@/app/api/bq/_lib/handle");
    const res = bqErrorResponse(
      "raw string error with sensitive_path /etc/passwd",
      "test",
    );
    const body = (await res.json()) as { error: string };
    expect(body).toEqual({ error: "Query failed" });
    expect(body.error).not.toContain("sensitive_path");
    consoleSpy.mockRestore();
  });
});
