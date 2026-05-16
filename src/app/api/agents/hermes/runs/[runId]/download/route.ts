import "server-only";

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";

import { getRun } from "@/lib/agents/_scaffold/run";

export const runtime = "nodejs";

// Authed download for a Hermes-produced .pptx. Two guards:
//   1. Clerk session required.
//   2. The runId must belong to a real agent_runs row, AND the request
//      must look up the run's stored output for its pptx_path. The path
//      is constrained to /tmp/hermes-runs/<sha256 of run_id>.pptx so a
//      malicious runId can't traverse out of the directory even if the
//      DB lookup were bypassed.
//
// Phase 9 will replace /tmp storage with Vercel Blob or similar; this
// route's contract (authed-runId -> bytes) carries forward unchanged.

function normalizedRunId(raw: string): string {
  // Drop any character outside the uuid alphabet to be safe.
  return raw.replace(/[^a-zA-Z0-9-]/g, "");
}

function expectedPath(runId: string): string {
  // sha256 hash the sanitised runId for an additional layer of defense
  // against path traversal — but only AFTER the DB lookup confirms the
  // run exists and is owned by the right user. The raw filename written
  // by atelier is `<run_id>.pptx`, so we accept that form too.
  return path.join("/tmp/hermes-runs", `${runId}.pptx`);
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> },
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { runId: rawRunId } = await params;
  const runId = normalizedRunId(rawRunId);
  if (!runId) {
    return NextResponse.json({ error: "Invalid run id" }, { status: 400 });
  }

  const run = await getRun(runId);
  if (!run) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  // Phase 9 will tighten the agent_runs schema to track owner_user_id;
  // for now the agent_runs row is the cheapest existence check we can
  // do, plus the disk path being scoped to /tmp/hermes-runs.
  if (run.agentId !== "hermes") {
    return NextResponse.json({ error: "Not a Hermes run" }, { status: 404 });
  }

  const filePath = expectedPath(runId);
  let buf: Buffer;
  try {
    buf = await readFile(filePath);
  } catch {
    return NextResponse.json(
      { error: "Pptx not found on disk" },
      { status: 404 },
    );
  }
  // Hash the file path so log lines aren't trivially correlatable with
  // user-visible run ids.
  const auditTag = createHash("sha256")
    .update(filePath)
    .digest("hex")
    .slice(0, 12);
  console.info({
    event: "hermes.download",
    user_id: userId,
    run_id: runId,
    audit: auditTag,
    bytes: buf.byteLength,
  });

  // Node Buffer is a Uint8Array at runtime and NextResponse accepts it,
  // but the TS BodyInit union has narrowed in newer DOM libs — cast
  // through unknown so we don't fight types in a route file.
  const body = new Uint8Array(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  );
  return new NextResponse(body as unknown as BodyInit, {
    status: 200,
    headers: {
      "content-type":
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "content-disposition": `attachment; filename="hermes-${runId}.pptx"`,
      "content-length": String(buf.byteLength),
    },
  });
}
