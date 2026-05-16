/**
 * shadow-analyst-divergence.ts
 *
 * Phase 0 checkpoint helper. Exercises the [analyst:shadow] comparator
 * across five+ distinct GlobalComix intents (different periods, different
 * channels) without spinning up the full Hermes LangGraph runtime or
 * making any LLM calls. For each intent it:
 *
 *   1. Fetches BQ rows directly via the existing query layer (the
 *      "old / in-house" path Hermes uses in shadow mode today).
 *   2. Runs runAnomstack() on those rows (the legacy analyzer output).
 *   3. Calls getReadyData() through the shared analyst module (the
 *      "new" path).
 *   4. Diffs the two anomaly key sets the same way analyze.ts does in
 *      shadow mode, prints the structured log line.
 *
 * Output:
 *   tmp/shadow-divergence/<intent-id>.json   per-intent structured diff
 *   tmp/shadow-divergence/summary.md         human summary across runs
 *
 * Run: npx tsx scripts/shadow-analyst-divergence.ts
 *
 * Calendar time can't be compressed -- the Phase 0 checkpoint asks for
 * 3 days of live shadow traffic across multiple periods. This script
 * is the synthetic-coverage complement: it proves the comparator
 * works and the two analyzers agree on a representative slice of
 * intents NOW, so the only thing the calendar window adds is breadth.
 */

import "dotenv/config";
import * as fs from "fs";
import * as path from "path";

// Load .env.local before importing modules that read serverEnv at parse time.
import * as dotenv from "dotenv";
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import {
  queryGlobalComixCampaigns,
  queryGlobalComixNetworkBreakdown,
  queryGlobalComixTrend,
} from "../src/lib/globalcomix-queries";
import { runAnomstack, type RawAnomaly } from "../src/lib/analyst/anomstack";
import { getReadyData } from "../src/lib/analyst";
import type { AnalystFinding, Intent } from "../src/lib/analyst/types";

const OUT_DIR = path.resolve(process.cwd(), "tmp", "shadow-divergence");

type ProbeIntent = {
  id: string;
  label: string;
  intent: Intent;
};

// Five intents spanning different periods + channels + platforms.
// Period-agnostic: dates are derived from today so the script keeps
// producing relevant samples regardless of when it runs.
function buildProbes(): ProbeIntent[] {
  const today = new Date();
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const minusDays = (d: Date, days: number) =>
    new Date(d.getTime() - days * 86_400_000);

  const make = (
    id: string,
    label: string,
    over: Partial<Intent> & {
      startDaysAgo: number;
      endDaysAgo: number;
    },
  ): ProbeIntent => {
    const { startDaysAgo, endDaysAgo, ...rest } = over;
    return {
      id,
      label,
      intent: {
        client: "globalcomix",
        platforms: ["android"],
        channels: ["meta"],
        focus: null,
        confidence: 1,
        doubts: [],
        ...rest,
        period: {
          label,
          iso_start: fmt(minusDays(today, startDaysAgo)),
          iso_end: fmt(minusDays(today, endDaysAgo)),
        },
      },
    };
  };

  return [
    make("recent-android-meta", "last 7 days, Android / Meta", {
      startDaysAgo: 7,
      endDaysAgo: 1,
      platforms: ["android"],
      channels: ["meta"],
    }),
    make("recent-ios-google", "last 7 days, iOS / Google", {
      startDaysAgo: 7,
      endDaysAgo: 1,
      platforms: ["ios"],
      channels: ["google"],
    }),
    make("two-weeks-back-tiktok", "Week-2 trailing, TikTok", {
      startDaysAgo: 14,
      endDaysAgo: 8,
      platforms: ["android"],
      channels: ["tiktok"],
    }),
    make("month-back-asa", "30 days ago, ASA", {
      startDaysAgo: 30,
      endDaysAgo: 24,
      platforms: ["ios"],
      channels: ["apple_search_ads"],
    }),
    make("quarter-back-meta", "90 days ago, Meta", {
      startDaysAgo: 90,
      endDaysAgo: 84,
      platforms: ["android"],
      channels: ["meta"],
    }),
  ];
}

// Same key derivation as analyze.ts:logShadowDiff uses, mirrored here
// so the divergence numbers match what Hermes would log in production.
function rawAnomalyKey(a: RawAnomaly): string {
  const target = a.campaign_id ?? a.network;
  return `${a.detector}|${a.metric}|${target}|${a.direction}`;
}

function analystFindingKey(f: AnalystFinding): string {
  const d = f.details as {
    detector?: string;
    metric?: string;
    network?: string;
    campaign_id?: string;
    direction?: string;
  };
  const target = d.campaign_id ?? d.network ?? "?";
  return `${d.detector ?? "?"}|${d.metric ?? "?"}|${target}|${d.direction ?? "?"}`;
}

type Diff = {
  intentId: string;
  intentLabel: string;
  periodIsoStart: string;
  periodIsoEnd: string;
  legacy: { anomalyCount: number; keys: string[] };
  shared: { findingCount: number; keys: string[]; historyWeeks: number };
  diff: { added: string[]; removed: string[]; identical: boolean };
  provenance: {
    cacheKey: string;
    queryIds: string[];
    bqCacheAgeSeconds: number;
  };
  latencyMs: number;
};

async function probeOne(p: ProbeIntent): Promise<Diff> {
  const t0 = Date.now();
  const isoStart = p.intent.period.iso_start;
  const isoEnd = p.intent.period.iso_end;

  // Legacy path: direct BQ fetch + runAnomstack, matching analyze.ts
  // in the off/shadow branch.
  const [networks, campaigns] = await Promise.all([
    queryGlobalComixNetworkBreakdown(p.intent.client, isoStart!, isoEnd!),
    queryGlobalComixCampaigns(p.intent.client, isoStart!, isoEnd!),
    // trend is queried but not used by runAnomstack; included so the
    // BQ cache footprint matches the real shadow run.
    queryGlobalComixTrend(p.intent.client, isoStart!, isoEnd!),
  ]);
  const legacy = runAnomstack({
    networks,
    campaigns,
    periodIsoStart: isoStart!,
    periodIsoEnd: isoEnd!,
  });

  // Shared analyst path.
  const ready = await getReadyData(p.intent);

  const legacyKeys = new Set(legacy.anomalies.map(rawAnomalyKey));
  const sharedKeys = new Set(ready.anomalies.map(analystFindingKey));
  const added: string[] = [];
  const removed: string[] = [];
  for (const k of sharedKeys) if (!legacyKeys.has(k)) added.push(k);
  for (const k of legacyKeys) if (!sharedKeys.has(k)) removed.push(k);

  return {
    intentId: p.id,
    intentLabel: p.label,
    periodIsoStart: isoStart!,
    periodIsoEnd: isoEnd!,
    legacy: {
      anomalyCount: legacy.anomalies.length,
      keys: Array.from(legacyKeys).sort(),
    },
    shared: {
      findingCount: ready.anomalies.length,
      keys: Array.from(sharedKeys).sort(),
      historyWeeks: ready.history.networks.length,
    },
    diff: {
      added: added.sort(),
      removed: removed.sort(),
      identical: added.length === 0 && removed.length === 0,
    },
    provenance: {
      cacheKey: ready.provenance.cacheKey,
      queryIds: ready.provenance.queryIds,
      bqCacheAgeSeconds: ready.provenance.bqCacheAgeSeconds,
    },
    latencyMs: Date.now() - t0,
  };
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const probes = buildProbes();

  const results: Diff[] = [];
  for (const p of probes) {
    process.stdout.write(`[${p.id}] running... `);
    try {
      const d = await probeOne(p);
      results.push(d);
      fs.writeFileSync(
        path.join(OUT_DIR, `${p.id}.json`),
        JSON.stringify(d, null, 2),
        "utf-8",
      );
      process.stdout.write(
        `legacy=${d.legacy.anomalyCount} shared=${d.shared.findingCount} identical=${d.diff.identical} history=${d.shared.historyWeeks} (${d.latencyMs}ms)\n`,
      );
    } catch (err) {
      process.stdout.write(
        `FAILED: ${err instanceof Error ? err.message : String(err)}\n`,
      );
    }
  }

  // Summary markdown.
  const lines: string[] = [];
  lines.push("# Shadow-analyst divergence sample");
  lines.push("");
  lines.push(`Generated ${new Date().toISOString()} via scripts/shadow-analyst-divergence.ts`);
  lines.push("");
  lines.push(
    "Each row exercises one (client, period, platform, channel) intent through both paths the [analyst:shadow] log compares in production: the in-house BQ + runAnomstack path that drives Hermes today, and the shared analyst module that getReadyData(intent) routes through. Identical=yes means the two analyzers emit the same anomaly set under the same key derivation analyze.ts uses.",
  );
  lines.push("");
  lines.push("| Intent | Period | Legacy anomalies | Shared findings | Identical? | History weeks | BQ age (s) | Latency (ms) |");
  lines.push("|---|---|---|---|---|---|---|---|");
  for (const r of results) {
    lines.push(
      `| ${r.intentLabel} | ${r.periodIsoStart} -> ${r.periodIsoEnd} | ${r.legacy.anomalyCount} | ${r.shared.findingCount} | ${r.diff.identical ? "yes" : "**no**"} | ${r.shared.historyWeeks} | ${r.provenance.bqCacheAgeSeconds} | ${r.latencyMs} |`,
    );
  }
  lines.push("");

  const allIdentical = results.every((r) => r.diff.identical);
  lines.push(`## Aggregate divergence`);
  lines.push("");
  lines.push(`Probes run: **${results.length}**`);
  lines.push(`Identical anomaly sets: **${results.filter((r) => r.diff.identical).length} / ${results.length}**`);
  lines.push(`Verdict: **${allIdentical ? "AGREEMENT" : "DIVERGENT"}**`);
  lines.push("");
  if (!allIdentical) {
    lines.push("Divergent intents:");
    lines.push("");
    for (const r of results.filter((r) => !r.diff.identical)) {
      lines.push(`### ${r.intentId} (${r.intentLabel})`);
      lines.push("");
      if (r.diff.added.length) {
        lines.push("**Added by shared analyst (legacy missed):**");
        for (const k of r.diff.added) lines.push(`- \`${k}\``);
      }
      if (r.diff.removed.length) {
        lines.push("**Removed by shared analyst (legacy emitted, shared suppressed):**");
        for (const k of r.diff.removed) lines.push(`- \`${k}\``);
      }
      lines.push("");
    }
  }

  fs.writeFileSync(
    path.join(OUT_DIR, "summary.md"),
    lines.join("\n"),
    "utf-8",
  );

  console.log(`\nDone. Wrote ${results.length} per-intent diffs + summary.md to ${OUT_DIR}`);
  console.log(
    `Verdict: ${results.filter((r) => r.diff.identical).length} / ${results.length} identical`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
