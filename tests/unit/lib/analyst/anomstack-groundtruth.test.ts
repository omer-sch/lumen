// @vitest-environment node
// Layer 2 (lib unit). File under test: src/lib/analyst/anomstack.ts.
//
// Ground-truth fixtures: the JSON files in ./fixtures/ pair a synthetic
// BQ snapshot with a hand-authored expected-findings list. Anomstack's
// output for the same input MUST match the expectation; if a detector
// changes behavior and the human still wants the new behavior, the
// expected.json updates in the same PR. The fixture is the contract.
//
// Three fixtures (recent-period, mid-window, maturing-cohorts) cover:
//   1. Positive case: clean fires for spend z-score, network cpa_d7
//      percent-delta, and campaign spend deltas.
//   2. Negative case: no false positives on a "normal" period.
//   3. Cohort-maturity gate: a finding that would fire is suppressed
//      because sub_d7 is below COHORT_D7_MATURITY_THRESHOLD; the
//      suppression count is checked too so we know the gate is what
//      saved us, not an accident of the data.
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { runAnomstack, type RawAnomaly } from "@/lib/analyst/anomstack";
import type { CampaignRow, NetworkRow } from "@/types/dashboard";

type InputFixture = {
  _meta: { periodIsoStart: string; periodIsoEnd: string };
  networks: NetworkRow[];
  campaigns: CampaignRow[];
};

type ExpectedFinding = {
  detector: "z_score" | "percent_delta";
  metric: string;
  target: string;
  direction: "up" | "down";
};

type ExpectedFixture = {
  expectedFindings: ExpectedFinding[];
  expectedCounts: {
    z_score: number;
    percent_delta_network: number;
    percent_delta_campaign: number;
    suppressed_by_cohort_gate: number;
  };
};

function loadFixture(name: string): {
  input: InputFixture;
  expected: ExpectedFixture;
} {
  const dir = join(__dirname, "fixtures");
  const input = JSON.parse(
    readFileSync(join(dir, `${name}.input.json`), "utf8"),
  ) as InputFixture;
  const expected = JSON.parse(
    readFileSync(join(dir, `${name}.expected.json`), "utf8"),
  ) as ExpectedFixture;
  return { input, expected };
}

// Normalisation: anomstack emits a RawAnomaly array; the expected
// fixture is a smaller (detector, metric, target, direction) tuple
// per finding. Strip RawAnomaly to that shape, sort both sides, and
// deep-equal.
function normalise(a: RawAnomaly): ExpectedFinding {
  return {
    detector: a.detector,
    metric: a.metric,
    target: a.campaign_id ?? a.network,
    direction: a.direction,
  };
}

function sortKey(f: ExpectedFinding): string {
  return `${f.detector}|${f.metric}|${f.target}|${f.direction}`;
}

describe("anomstack ground-truth fixtures", () => {
  for (const name of ["recent-period", "mid-window", "maturing-cohorts"]) {
    it(`matches expected findings for ${name}`, () => {
      const { input, expected } = loadFixture(name);
      const r = runAnomstack({
        networks: input.networks,
        campaigns: input.campaigns,
        periodIsoStart: input._meta.periodIsoStart,
        periodIsoEnd: input._meta.periodIsoEnd,
      });
      const got = r.anomalies.map(normalise).sort((a, b) =>
        sortKey(a).localeCompare(sortKey(b)),
      );
      const want = expected.expectedFindings
        .map((f) => ({
          detector: f.detector,
          metric: f.metric,
          target: f.target,
          direction: f.direction,
        }))
        .sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
      expect(got).toEqual(want);
    });

    it(`matches expected counts for ${name}`, () => {
      const { input, expected } = loadFixture(name);
      const r = runAnomstack({
        networks: input.networks,
        campaigns: input.campaigns,
        periodIsoStart: input._meta.periodIsoStart,
        periodIsoEnd: input._meta.periodIsoEnd,
      });
      expect(r.counts).toEqual(expected.expectedCounts);
    });

    it(`stamps provenance on every emitted finding for ${name}`, () => {
      const { input } = loadFixture(name);
      const r = runAnomstack({
        networks: input.networks,
        campaigns: input.campaigns,
        periodIsoStart: input._meta.periodIsoStart,
        periodIsoEnd: input._meta.periodIsoEnd,
      });
      for (const f of r.findings) {
        expect(f.id).toMatch(/^[0-9a-f]{16}$/);
        expect(f.provenance.algorithm).toMatch(/^anomstack\//);
        expect(f.provenance.queryIds.length).toBeGreaterThan(0);
        expect(f.provenance.computedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
        expect(Object.keys(f.provenance.inputs).length).toBeGreaterThan(0);
      }
    });

    it(`emits stable ids across runs for ${name}`, () => {
      const { input } = loadFixture(name);
      const args = {
        networks: input.networks,
        campaigns: input.campaigns,
        periodIsoStart: input._meta.periodIsoStart,
        periodIsoEnd: input._meta.periodIsoEnd,
      };
      const a = runAnomstack(args).findings.map((f) => f.id).sort();
      const b = runAnomstack(args).findings.map((f) => f.id).sort();
      expect(a).toEqual(b);
    });
  }
});
