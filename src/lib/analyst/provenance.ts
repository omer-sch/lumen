import "server-only";

import { createHash } from "node:crypto";

import type {
  AnalystFinding,
  AnalystFindingKind,
  FindingProvenance,
  ReadyDataProvenance,
} from "./types";

// Provenance helpers. Single point where stable ids and FindingProvenance
// structs are minted, so every detector (anomstack, rankings,
// comparisons) stamps the same shape. If a Finding is emitted without
// going through these helpers it lacks provenance, which is the
// non-negotiable trust property the analyst guarantees.

/**
 * Stable id for an AnalystFinding. Hash inputs are (kind, target,
 * period). Same input twice in a row produces the same id, which lets
 * downstream consumers dedupe across runs and store decisions
 * ("acknowledged", "dismissed") against a finding without the id
 * shifting when the algorithm re-runs.
 *
 * `target` is the specific entity the finding is about: a network name
 * for a network-level z-score, a campaign_id for a campaign-level
 * percent-delta. `extra` lets the detector add discriminators (the
 * metric, the detector flavor) so two anomalies on the same network in
 * the same period for different metrics don't collide.
 */
export function findingId(args: {
  kind: AnalystFindingKind;
  target: string;
  periodIsoStart: string;
  periodIsoEnd: string;
  extra?: Record<string, string | number | boolean | null | undefined>;
}): string {
  const payload = {
    kind: args.kind,
    target: args.target,
    period: { start: args.periodIsoStart, end: args.periodIsoEnd },
    extra: canonicalize(args.extra ?? {}),
  };
  return createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex")
    .slice(0, 16);
}

/**
 * Stamp a FindingProvenance struct. The current ISO timestamp is set
 * here so detectors don't have to remember to pass it. `inputs` is a
 * free-form record of the scalars the algorithm consumed — keep it
 * small (the values that would reproduce the computation), not the
 * raw BQ row.
 */
export function stampFindingProvenance(args: {
  algorithm: string;
  inputs: Record<string, unknown>;
  queryIds: string[];
}): FindingProvenance {
  return {
    algorithm: args.algorithm,
    inputs: args.inputs,
    queryIds: args.queryIds.slice(),
    computedAt: new Date().toISOString(),
  };
}

/**
 * Stamp a ReadyDataProvenance struct. Every BQ query that fed the
 * ReadyData appears in queryIds (a superset of any single finding's
 * provenance); cacheKey is the analyst-layer cache key so debug
 * surfaces can correlate against the Redis store.
 */
export function stampReadyDataProvenance(args: {
  queryIds: string[];
  cacheKey: string;
  bqCacheAgeSeconds: number;
}): ReadyDataProvenance {
  return {
    queryIds: args.queryIds.slice(),
    cacheKey: args.cacheKey,
    fetchedAt: new Date().toISOString(),
    bqCacheAgeSeconds: Math.max(0, Math.floor(args.bqCacheAgeSeconds)),
  };
}

/**
 * Guard helper: asserts a finding has the required provenance fields
 * before it leaves a detector. Catches the case where someone builds
 * an AnalystFinding by hand without calling stampFindingProvenance.
 */
export function assertFindingProvenance(f: AnalystFinding): void {
  const p = f.provenance;
  if (!p) {
    throw new Error(`analyst: finding ${f.id} missing provenance`);
  }
  if (!p.algorithm) {
    throw new Error(`analyst: finding ${f.id} missing provenance.algorithm`);
  }
  if (!p.queryIds || p.queryIds.length === 0) {
    throw new Error(`analyst: finding ${f.id} missing provenance.queryIds`);
  }
  if (!p.computedAt) {
    throw new Error(`analyst: finding ${f.id} missing provenance.computedAt`);
  }
}

// Internal: canonical JSON for stable hashing (keys sorted, undefined
// dropped). Same shape as src/lib/cache/keys.ts canonicalize but kept
// local to avoid a cross-module dependency on a non-exported helper.
function canonicalize(v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) return v.map(canonicalize);
  if (typeof v === "object") {
    const obj = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(obj).sort()) {
      const val = canonicalize(obj[k]);
      if (val !== undefined) out[k] = val;
    }
    return out;
  }
  return v;
}
