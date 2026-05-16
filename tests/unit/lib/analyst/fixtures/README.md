# Analyst ground-truth fixtures

These three fixtures are **synthetic**, not anonymized prod snapshots.
They are committed to the repo on purpose: the point of a ground-truth
test is to have a hand-authored "given this input, the detector should
produce exactly this output" pair that humans can read, argue about,
and revise when the algorithm changes.

Each fixture has two files:

- `<name>.input.json` — the BQ rows the analyst would see for that
  period: a `networks` array of `NetworkRow` and a `campaigns` array of
  `CampaignRow`. Shapes match `@/types/dashboard`.
- `<name>.expected.json` — the human-authored list of anomalies (with
  detector, metric, target, direction, severity) that anomstack should
  emit, plus the suppression count the cohort-maturity gate should
  report.

## Why synthetic, not prod

Three reasons:

1. **Repo-safe.** Prod BQ rows contain client metrics that are
   confidential, even after anonymisation: the magnitude of spend on a
   single network is a reverse-engineerable signal for someone who knows
   the agency.
2. **Reviewable.** A reader can scan a synthetic fixture and verify the
   expected output by hand. A prod snapshot has hundreds of rows and the
   expected output becomes "trust the algorithm" instead of ground truth.
3. **Adversarial.** We can construct exactly the edge cases we want to
   guard against: a mature outlier (should fire), a maturing outlier
   (should suppress), a tight population with one extreme value (should
   fire on z-score), a sparse population (should silence the detector).

If we ever want a prod-snapshot regression suite that's a complement,
not a replacement, and it lives outside this directory.

## Fixtures

### `recent-period`

A typical 7-day window with four networks: Meta, Google, TikTok, Apple.
Sub_d7 above the cohort-maturity threshold on three of the four; one
extreme cpa_d7 mover on Meta that crosses the percent-delta threshold;
one spend outlier (Google) that crosses the z-score threshold; two
campaigns with clear spend deltas.

**Expected:** 1 z-score anomaly (spend / Google), 1 percent-delta
network anomaly (cpa_d7 / Meta), 2 campaign anomalies.

### `mid-window`

A three-network mid-window snapshot where every value is close to the
cross-network mean and every delta is small. The detector should emit
zero anomalies.

**Expected:** 0 anomalies. Tests the negative case (no false positives
on a "normal" period).

### `maturing-cohorts`

Same four networks as `recent-period` but two of them have sub_d7 below
the cohort-maturity threshold. The cpa_d7 anomalies on those rows
should be **suppressed** by the maturity gate, not emitted as findings.
The spend / cpi z-scores still fire because they don't divide by sub_d7.

**Expected:** 1 z-score anomaly (spend); 0 percent-delta network
anomalies (suppressed); `suppressed_by_cohort_gate` >= 1.
