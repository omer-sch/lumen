/**
 * discover-bq-metadata.ts
 *
 * Bucket 1, Phase 2 discovery: project-level metadata.
 *  - Per-dataset IAM (via bq show --format=prettyjson, then parsed).
 *  - Routines (stored procs / UDFs) across all datasets via region-us
 *    INFORMATION_SCHEMA.ROUTINES.
 *  - Object privileges and row-access policies via region-us INFORMATION_SCHEMA.
 *  - Records the permission gaps for project-level IAM and data transfers
 *    so we know what to ask the BI team for.
 *
 * Read-only. Output: tmp/bq-discovery/09-project-metadata.json
 */

import * as fs from "fs";
import * as path from "path";
import * as cp from "child_process";
import * as dotenv from "dotenv";
import { BigQuery } from "@google-cloud/bigquery";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const PROJECT = process.env.BQ_PROJECT ?? "yellowhead-visionbi-rivery";
const OUT_DIR = path.resolve(process.cwd(), "tmp", "bq-discovery");
const OUT_FILE = path.join(OUT_DIR, "09-project-metadata.json");

fs.mkdirSync(OUT_DIR, { recursive: true });

function buildBq(): BigQuery {
  const b64 = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
  if (b64) {
    const credentials = JSON.parse(Buffer.from(b64, "base64").toString("utf-8"));
    return new BigQuery({ projectId: PROJECT, credentials });
  }
  return new BigQuery({ projectId: PROJECT });
}

function v(x: unknown): unknown {
  if (x && typeof x === "object" && "value" in (x as object)) return (x as { value: unknown }).value;
  return x;
}

type Row = Record<string, unknown>;

async function q(bq: BigQuery, sql: string): Promise<Row[]> {
  const [rows] = await bq.query({ query: sql, location: "US" });
  return rows as Row[];
}

function shell(cmd: string): { stdout: string; stderr: string; ok: boolean } {
  try {
    const stdout = cp.execSync(cmd, { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] });
    return { stdout, stderr: "", ok: true };
  } catch (e) {
    const err = e as { stdout?: Buffer | string; stderr?: Buffer | string };
    return {
      stdout: typeof err.stdout === "string" ? err.stdout : err.stdout?.toString("utf-8") ?? "",
      stderr: typeof err.stderr === "string" ? err.stderr : err.stderr?.toString("utf-8") ?? "",
      ok: false,
    };
  }
}

// Datasets discovered in Phase 1. Hard-code so we don't re-query.
const DATASETS = [
  "pw_yh_cohort_aggregated_stats_google",
  "rivery_activity_anlytics",
  "seo_screamingfrog",
  "yellowHEAD_SQL_exam",
  "yellowhead_bkp",
  "yellowhead_bkp_archieved_tables",
  "yellowhead_bkp_us_1m",
  "yellowhead_bkp_us_6m",
  "yellowhead_prod",
  "yellowhead_temp",
  "yellowhead_training",
  "yh_bq_logs",
  "yh_singular",
  // receipts_users is the unlinked one; skip.
];

async function run() {
  console.log(`Bucket 1: project-level metadata for ${PROJECT}…`);
  const out: Record<string, unknown> = {
    project: PROJECT,
    captured_at: new Date().toISOString(),
    caller_email: null as string | null,
    permission_gaps: [] as Array<{ scope: string; error: string }>,
  };

  // Caller identity.
  const id = shell("gcloud auth list --filter=status:ACTIVE --format='value(account)'");
  out.caller_email = id.stdout.trim() || null;
  console.log(`  caller: ${out.caller_email}`);

  // Project-level IAM (will likely fail for read-only callers).
  console.log("\n  project IAM…");
  const projIam = shell(`gcloud projects get-iam-policy ${PROJECT} --format=json`);
  if (projIam.ok) {
    out.project_iam = JSON.parse(projIam.stdout);
  } else {
    out.project_iam = null;
    (out.permission_gaps as Array<{ scope: string; error: string }>).push({
      scope: "project_iam",
      error: projIam.stderr.split("\n")[0],
    });
    console.log(`    (denied) ${projIam.stderr.split("\n")[0]}`);
  }

  // Per-dataset IAM via bq show.
  console.log("\n  per-dataset IAM via bq show…");
  const datasetIam: Record<string, unknown> = {};
  for (const ds of DATASETS) {
    const r = shell(`bq show --format=prettyjson ${PROJECT}:${ds}`);
    if (!r.ok) {
      datasetIam[ds] = { __error: r.stderr.split("\n")[0] };
      console.log(`    ${ds}: error ${r.stderr.split("\n")[0]}`);
      continue;
    }
    try {
      const parsed = JSON.parse(r.stdout);
      datasetIam[ds] = {
        access: parsed.access,
        location: parsed.location,
        creationTime: parsed.creationTime,
        lastModifiedTime: parsed.lastModifiedTime,
        maxTimeTravelHours: parsed.maxTimeTravelHours,
        labels: parsed.labels ?? null,
        type: parsed.type,
        description: parsed.description ?? null,
        defaultTableExpirationMs: parsed.defaultTableExpirationMs ?? null,
      };
      const accessCount = (parsed.access as unknown[] | undefined)?.length ?? 0;
      console.log(`    ${ds}: ${accessCount} access entries`);
    } catch (e) {
      datasetIam[ds] = { __error: `parse failed: ${(e as Error).message}` };
    }
  }
  out.dataset_iam = datasetIam;

  // Routines (stored procs + UDFs).
  console.log("\n  routines…");
  const bq = buildBq();
  const routines: Row[] = [];
  for (const ds of DATASETS) {
    try {
      const rows = await q(
        bq,
        `
          SELECT
            '${ds}' AS dataset,
            routine_name,
            routine_type,
            routine_catalog,
            data_type,
            external_language,
            created,
            last_altered
          FROM \`${PROJECT}.${ds}.INFORMATION_SCHEMA.ROUTINES\`
        `,
      );
      for (const r of rows) {
        routines.push({
          dataset: String(r.dataset),
          routine_name: String(r.routine_name),
          routine_type: String(r.routine_type),
          data_type: r.data_type ? String(r.data_type) : null,
          language: r.external_language ? String(r.external_language) : null,
          created: r.created ? String(v(r.created)) : null,
          last_altered: r.last_altered ? String(v(r.last_altered)) : null,
        });
      }
      if (rows.length > 0) console.log(`    ${ds}: ${rows.length} routines`);
    } catch (e) {
      console.log(`    ${ds}: error ${(e as Error).message.split("\n")[0]}`);
    }
  }
  out.routines = routines;
  console.log(`  → total ${routines.length} routines`);

  // For any routines found, pull their definitions in a second pass (capped).
  if (routines.length > 0 && routines.length <= 50) {
    console.log("\n  routine bodies…");
    const bodies: Record<string, string | null> = {};
    for (const r of routines) {
      const ds = String((r as Row).dataset);
      const name = String((r as Row).routine_name);
      try {
        const rows = await q(
          bq,
          `SELECT routine_definition FROM \`${PROJECT}.${ds}.INFORMATION_SCHEMA.ROUTINES\` WHERE routine_name = '${name.replace(/'/g, "")}'`,
        );
        bodies[`${ds}.${name}`] = rows[0]?.routine_definition ? String(rows[0].routine_definition) : null;
      } catch (e) {
        bodies[`${ds}.${name}`] = `__error: ${(e as Error).message.split("\n")[0]}`;
      }
    }
    out.routine_bodies = bodies;
  }

  // Data transfers.
  console.log("\n  data transfers…");
  const xfer = shell(`bq ls --transfer_config --transfer_location=us --format=prettyjson --max_results=500`);
  if (xfer.ok) {
    try {
      out.data_transfers = JSON.parse(xfer.stdout);
    } catch {
      out.data_transfers = { __raw: xfer.stdout.slice(0, 5000) };
    }
  } else {
    out.data_transfers = null;
    (out.permission_gaps as Array<{ scope: string; error: string }>).push({
      scope: "data_transfers",
      error: xfer.stderr.split("\n")[0],
    });
    console.log(`    (denied) ${xfer.stderr.split("\n")[0]}`);
  }

  // BigQuery's OBJECT_PRIVILEGES INFORMATION_SCHEMA view requires a literal
  // `WHERE object_name = '<name>'` predicate, so we cannot enumerate
  // table-level grants without first knowing every table name. For our
  // purposes the dataset-level access list (captured above via `bq show`)
  // is the meaningful authorization signal. Authorized-view introspection
  // remains an open ask; see permission_gaps.
  out.object_privileges = null;
  (out.permission_gaps as Array<{ scope: string; error: string }>).push({
    scope: "object_privileges",
    error: "INFORMATION_SCHEMA.OBJECT_PRIVILEGES requires WHERE object_name='…' so global enumeration is not possible. Authorized-view inventory unknown.",
  });

  // Row-access policies need a per-table scope; we'll scan via INFORMATION_SCHEMA.ROW_ACCESS_POLICIES in each dataset.
  const rls: Row[] = [];
  for (const ds of DATASETS) {
    try {
      const rows = await q(
        bq,
        `SELECT '${ds}' AS dataset, * FROM \`${PROJECT}.${ds}.INFORMATION_SCHEMA.ROW_ACCESS_POLICIES\``,
      );
      for (const r of rows) {
        const o: Row = {};
        for (const k of Object.keys(r)) o[k] = v(r[k]);
        rls.push(o);
      }
    } catch {
      // Most datasets won't have RLS; INFORMATION_SCHEMA.ROW_ACCESS_POLICIES may not exist either.
    }
  }
  out.row_access_policies = rls;
  console.log(`    row-access policies: ${rls.length}`);

  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2), "utf-8");
  console.log(`\nWrote ${OUT_FILE}`);
}

run().catch((err) => {
  console.error("FAILED:", err);
  process.exit(1);
});
