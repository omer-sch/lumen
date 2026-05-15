import "server-only";

import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getAdminUserId } from "@/lib/auth/admin";
import { indexCommsThread, type CommsThread } from "@/lib/rag/indexers/comms";
import { indexAgentRunOutput } from "@/lib/rag/indexers/history";
import { indexKnowledgeDocument } from "@/lib/rag/indexers/knowledge";

export const runtime = "nodejs";
export const maxDuration = 300;

// Manual indexer. Admin allowlist only (LUMEN_ADMIN_USER_IDS, same
// gate as /api/cache/refresh). The cron + Supabase-trigger entry points
// are separate so the audit log can attribute each indexing call to a
// real identity (admin user id) versus a shared secret (cron). Comms
// is included here for hand-testing the shell before Gmail OAuth lands;
// in production the OAuth callback will call indexCommsThread directly.

const BodySchema = z.discriminatedUnion("corpus", [
  z.object({
    corpus: z.literal("knowledge"),
    source_path: z.string().min(1).max(500),
    content: z.string().min(1),
    metadata: z.record(z.string(), z.unknown()).optional(),
  }),
  z.object({
    corpus: z.literal("history"),
    agent: z.string().min(1),
    run_id: z.string().min(1),
    content: z.string().min(1),
    metadata: z.record(z.string(), z.unknown()).optional(),
  }),
  z.object({
    corpus: z.literal("comms"),
    thread: z.object({
      client: z.string().min(1),
      thread_id: z.string().min(1),
      subject: z.string(),
      participants: z.array(
        z.object({ name: z.string(), email: z.string() }),
      ),
      messages: z.array(
        z.object({
          from: z.string(),
          to: z.array(z.string()),
          sent_at: z.string(),
          body: z.string(),
        }),
      ),
    }),
  }),
]);

/**
 * Constant-time secret comparison. Matches the canonical helper in
 * /api/cron/warm-cache/route.ts verbatim so a future rotation only has
 * to touch one shape. Walks a fixed-length sweep on the length-mismatch
 * path so the rejection time doesn't leak the secret length.
 */
function isValidBackfillSecret(provided: string): boolean {
  const expected = process.env.CRON_SECRET ?? "";
  if (!expected || expected.length !== provided.length) {
    let diff = expected.length === provided.length ? 0 : 1;
    const len = Math.max(expected.length, provided.length, 32);
    for (let i = 0; i < len; i++) {
      diff |= (expected.charCodeAt(i) || 0) ^ (provided.charCodeAt(i) || 0);
    }
    return diff === 0 && expected.length > 0;
  }
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ provided.charCodeAt(i);
  }
  return diff === 0 && expected.length > 0;
}

export async function POST(req: NextRequest) {
  // Two auth paths:
  //   1. Clerk session + admin allowlist (interactive admin use).
  //   2. `x-backfill-secret: <CRON_SECRET>` (the local backfill script
  //      uses this to call the API without a Clerk session — same
  //      shared secret as the cron route).
  const backfillSecret = req.headers.get("x-backfill-secret") ?? "";
  const isBackfill = backfillSecret.length > 0 && isValidBackfillSecret(backfillSecret);

  let principalLabel: string;
  if (isBackfill) {
    principalLabel = "backfill-script";
  } else {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const adminUserId = await getAdminUserId();
    if (!adminUserId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    principalLabel = adminUserId;
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const body = parsed.data;
  const start = Date.now();

  let result: { chunks_indexed: number; embedding_tokens: number; cost_usd: number };
  switch (body.corpus) {
    case "knowledge":
      result = await indexKnowledgeDocument({
        source_path: body.source_path,
        content: body.content,
        metadata: body.metadata,
      });
      break;
    case "history":
      result = await indexAgentRunOutput({
        agent: body.agent,
        run_id: body.run_id,
        content: body.content,
        metadata: body.metadata,
      });
      break;
    case "comms":
      result = await indexCommsThread(body.thread as CommsThread);
      break;
  }

  console.info({
    event: "rag.index",
    principal: principalLabel,
    corpus: body.corpus,
    chunks_indexed: result.chunks_indexed,
    embedding_tokens: result.embedding_tokens,
    cost_usd: result.cost_usd,
    latencyMs: Date.now() - start,
  });

  return NextResponse.json(result);
}
