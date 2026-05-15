import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { indexAgentRunOutput } from "@/lib/rag/indexers/history";

export const runtime = "nodejs";
export const maxDuration = 60;

// Called by the Supabase agent_runs after-update trigger via pg_net
// when a run transitions to status=completed. The trigger function
// passes a bearer token equal to `CRON_SECRET` (set as the
// `lumen.cron_secret` GUC on the database). Cron-style shared-secret
// auth so the trigger doesn't need a Clerk session.
//
// The trigger sends the raw `output` jsonb; we render it to a text
// blob here so the embedder sees something useful. Different agents
// shape their outputs differently — Hermes will produce bullets +
// findings, Aria produces image titles, etc. The defensive default
// just stringifies the JSON; agents that want better tone retrieval
// should land their own shape-to-text formatter and call this with a
// pre-formatted `content` field instead.

const BodySchema = z.object({
  agent_id: z.string().min(1),
  run_id: z.string().min(1),
  output: z.unknown(),
  client: z.string().nullable().optional(),
  completed_at: z.string().optional(),
});

/**
 * Constant-time secret comparison. Matches the canonical helper in
 * /api/cron/warm-cache/route.ts verbatim. The trailing
 * `expected.length > 0` guard is load-bearing: without it, an unset
 * CRON_SECRET plus an empty bearer would compare-equal.
 */
function isValidSecret(provided: string): boolean {
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

function bearerFromHeader(value: string | null): string {
  if (!value) return "";
  const m = value.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : "";
}

function renderOutputAsText(output: unknown): string {
  // Hermes-shaped: { bullets: [...], findings: [...] }. Render as
  // markdown so the chunker can section it. Anything else falls back
  // to a JSON dump so we still embed something useful.
  if (output && typeof output === "object") {
    const o = output as Record<string, unknown>;
    const sections: string[] = [];
    if (Array.isArray(o.bullets) && o.bullets.length > 0) {
      sections.push(
        "## Bullets\n\n" +
          o.bullets
            .map((b) => {
              if (typeof b === "string") return `- ${b}`;
              if (b && typeof b === "object" && "claim" in b) {
                return `- ${String((b as { claim: unknown }).claim)}`;
              }
              return `- ${JSON.stringify(b)}`;
            })
            .join("\n"),
      );
    }
    if (Array.isArray(o.findings) && o.findings.length > 0) {
      sections.push(
        "## Findings\n\n" +
          o.findings
            .map((f) => {
              if (typeof f === "string") return f;
              return JSON.stringify(f, null, 2);
            })
            .join("\n\n"),
      );
    }
    if (sections.length > 0) return sections.join("\n\n");
  }
  return "```json\n" + JSON.stringify(output, null, 2) + "\n```";
}

export async function POST(req: NextRequest) {
  const token = bearerFromHeader(req.headers.get("authorization"));
  if (!isValidSecret(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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

  const { agent_id, run_id, output, client, completed_at } = parsed.data;
  const content = renderOutputAsText(output);
  if (content.length === 0) {
    return NextResponse.json({ chunks_indexed: 0, skipped: "empty content" });
  }

  const start = Date.now();
  const result = await indexAgentRunOutput({
    agent: agent_id,
    run_id,
    content,
    metadata: {
      client: client ?? undefined,
      completed_at: completed_at ?? undefined,
    },
  });

  console.info({
    event: "rag.index_history",
    agent: agent_id,
    run_id,
    client,
    chunks_indexed: result.chunks_indexed,
    embedding_tokens: result.embedding_tokens,
    cost_usd: result.cost_usd,
    latencyMs: Date.now() - start,
  });

  return NextResponse.json(result);
}
