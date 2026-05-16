// @vitest-environment node
// Layer 2 (lib unit). File under test: src/lib/analyst/provenance.ts.
// Provenance is non-negotiable per the spec; this suite locks in the
// shape and the stable-id guarantees so a future regression cannot
// silently emit a finding without provenance.
import { describe, expect, it } from "vitest";

import {
  assertFindingProvenance,
  findingId,
  stampFindingProvenance,
  stampReadyDataProvenance,
} from "@/lib/analyst/provenance";
import type { AnalystFinding } from "@/lib/analyst/types";

describe("findingId", () => {
  it("is a 16-char hex hash", () => {
    const id = findingId({
      kind: "anomaly",
      target: "Meta",
      periodIsoStart: "2026-05-01",
      periodIsoEnd: "2026-05-07",
      extra: { metric: "spend", detector: "z_score" },
    });
    expect(id).toMatch(/^[0-9a-f]{16}$/);
  });

  it("is deterministic for the same input", () => {
    const args = {
      kind: "anomaly" as const,
      target: "Meta",
      periodIsoStart: "2026-05-01",
      periodIsoEnd: "2026-05-07",
      extra: { metric: "spend", detector: "z_score" },
    };
    expect(findingId(args)).toBe(findingId(args));
  });

  it("changes when target changes", () => {
    const base = {
      kind: "anomaly" as const,
      periodIsoStart: "2026-05-01",
      periodIsoEnd: "2026-05-07",
      extra: { metric: "spend" },
    };
    expect(findingId({ ...base, target: "Meta" })).not.toBe(
      findingId({ ...base, target: "Google" }),
    );
  });

  it("changes when the period changes", () => {
    const base = {
      kind: "anomaly" as const,
      target: "Meta",
      extra: { metric: "spend" },
    };
    expect(
      findingId({ ...base, periodIsoStart: "2026-05-01", periodIsoEnd: "2026-05-07" }),
    ).not.toBe(
      findingId({ ...base, periodIsoStart: "2026-04-01", periodIsoEnd: "2026-04-07" }),
    );
  });

  it("is insensitive to extra-field key order (canonical-JSON hash)", () => {
    const base = {
      kind: "anomaly" as const,
      target: "Meta",
      periodIsoStart: "2026-05-01",
      periodIsoEnd: "2026-05-07",
    };
    const id1 = findingId({
      ...base,
      extra: { metric: "spend", detector: "z_score" },
    });
    const id2 = findingId({
      ...base,
      extra: { detector: "z_score", metric: "spend" },
    });
    expect(id1).toBe(id2);
  });
});

describe("stampFindingProvenance", () => {
  it("stamps the requested algorithm, inputs, queryIds and adds a fresh ISO timestamp", () => {
    const before = Date.now();
    const p = stampFindingProvenance({
      algorithm: "anomstack/z-score@1.0",
      inputs: { value: 1000, score: 2.04 },
      queryIds: ["network-breakdown"],
    });
    expect(p.algorithm).toBe("anomstack/z-score@1.0");
    expect(p.inputs).toEqual({ value: 1000, score: 2.04 });
    expect(p.queryIds).toEqual(["network-breakdown"]);
    expect(Date.parse(p.computedAt)).toBeGreaterThanOrEqual(before);
  });

  it("clones queryIds so the caller's array is not aliased", () => {
    const ids = ["a"];
    const p = stampFindingProvenance({
      algorithm: "x",
      inputs: {},
      queryIds: ids,
    });
    ids.push("b");
    expect(p.queryIds).toEqual(["a"]);
  });
});

describe("stampReadyDataProvenance", () => {
  it("stamps cacheKey, queryIds, and an integer non-negative bqCacheAgeSeconds", () => {
    const p = stampReadyDataProvenance({
      queryIds: ["network-breakdown", "campaigns"],
      cacheKey: "lumen:cache:v1:globalcomix:analyst-ready-data:abc",
      bqCacheAgeSeconds: 1234.7,
    });
    expect(p.queryIds).toEqual(["network-breakdown", "campaigns"]);
    expect(p.cacheKey).toContain("analyst-ready-data");
    expect(p.bqCacheAgeSeconds).toBe(1234);
    expect(Date.parse(p.fetchedAt)).not.toBeNaN();
  });

  it("clamps negative bqCacheAgeSeconds to 0", () => {
    const p = stampReadyDataProvenance({
      queryIds: [],
      cacheKey: "k",
      bqCacheAgeSeconds: -10,
    });
    expect(p.bqCacheAgeSeconds).toBe(0);
  });
});

describe("assertFindingProvenance", () => {
  function makeFinding(over: Partial<AnalystFinding["provenance"]>): AnalystFinding {
    return {
      id: "abc",
      kind: "anomaly",
      severity: "medium",
      summary: "x",
      details: {},
      provenance: {
        algorithm: "x",
        inputs: { v: 1 },
        queryIds: ["q"],
        computedAt: "2026-05-01T00:00:00.000Z",
        ...over,
      },
    };
  }

  it("does not throw on a fully-stamped finding", () => {
    expect(() => assertFindingProvenance(makeFinding({}))).not.toThrow();
  });

  it("throws when algorithm is missing", () => {
    expect(() =>
      assertFindingProvenance(makeFinding({ algorithm: "" })),
    ).toThrow(/algorithm/);
  });

  it("throws when queryIds is empty", () => {
    expect(() =>
      assertFindingProvenance(makeFinding({ queryIds: [] })),
    ).toThrow(/queryIds/);
  });

  it("throws when computedAt is missing", () => {
    expect(() =>
      assertFindingProvenance(makeFinding({ computedAt: "" })),
    ).toThrow(/computedAt/);
  });
});
