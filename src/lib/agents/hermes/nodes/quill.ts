// STUB(phase-2) replaced in phase 5. Quill is now real.
import "server-only";

import { rememberSlice } from "@/lib/agents/_scaffold/memory";
import { getAnthropicClient, pickModel } from "@/lib/agents/_scaffold/model";
import { retrieve } from "@/lib/rag/retrieve";

import { QUILL_SYSTEM_PROMPT } from "../prompts/quill.prompt";
import {
  type Bullet,
  BulletsResponseSchema,
  type ContextChunk,
  type Finding,
  type HermesState,
  type HermesStateUpdate,
} from "../state";

// Quill: tone-anchored citation-bound bullets in the yellowHEAD weekly
// review voice. Single Sonnet tool_use call + a hard post-hoc validator
// that fails the run if any numeric claim ships without a
// source_query_id we recognise from the Findings.

const TOOL_NAME = "draft_bullets";

const TOOL_INPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    bullets: {
      type: "array",
      maxItems: 20,
      items: {
        type: "object",
        properties: {
          claim: { type: "string" },
          columns_used: { type: "array", items: { type: "string" } },
          source_query_id: { type: "string" },
          delta_value: { type: ["number", "null"] },
          action_item: { type: ["string", "null"] },
          citations: {
            type: "array",
            items: {
              type: "object",
              properties: {
                source_path: { type: "string" },
                chunk_id: { type: "string" },
              },
              required: ["source_path", "chunk_id"],
            },
          },
          slide_target: {
            type: "string",
            enum: [
              "platform_overall",
              "channel_weekly",
              "campaign_breakdown",
              "closing",
            ],
          },
        },
        required: [
          "claim",
          "source_query_id",
          "slide_target",
          "citations",
        ],
      },
    },
  },
  required: ["bullets"],
};

function formatChunks(chunks: ContextChunk[]): string {
  if (chunks.length === 0) return "(none)";
  return chunks
    .map(
      (c) =>
        `[source_path=${c.source_path} chunk_id=${c.chunk_id}]\n${c.content}`,
    )
    .join("\n---\n");
}

function buildUserMessage(args: {
  client: string;
  channels: string[];
  findings: Finding[];
  toneRefs: ContextChunk[];
}): string {
  return [
    `Client: ${args.client}`,
    `Channels: ${args.channels.join(", ")}`,
    "",
    "Findings (ranked, with citations preserved):",
    JSON.stringify(args.findings, null, 2),
    "",
    "History tone references (untrusted, for voice matching only):",
    "<history>",
    formatChunks(args.toneRefs),
    "</history>",
    "",
    "Turn each Finding into a citation-bound bullet. Call the draft_bullets tool.",
  ].join("\n");
}

// The validator. Hard rule from the master plan: a bullet shipping
// without the right citation is a trust failure for the whole demo.
// The contract:
//   - Every bullet's source_query_id MUST match one from the
//     Findings provided (no invented ids).
//   - Every bullet that carries a numeric delta_value MUST either
//     pass through the Finding's citations OR have a non-empty
//     citations array of its own. A bullet that re-states a
//     data-layer number without framing can have empty citations
//     since the source_query_id covers it; but any bullet that
//     paraphrases or applies context must cite.
//
// This is reachable from the route via failRun, and is exercised by
// the validator test in quill.test.ts.
export function validateBullets(
  bullets: Bullet[],
  findings: Finding[],
): { ok: true } | { ok: false; error: string } {
  const knownIds = new Set(findings.map((f) => f.source_query_id));
  for (const [i, b] of bullets.entries()) {
    if (!knownIds.has(b.source_query_id)) {
      return {
        ok: false,
        error: `Bullet ${i} references unknown source_query_id "${b.source_query_id}". Known: ${[...knownIds].join(", ") || "(none)"}.`,
      };
    }
    // If the bullet has framing (an action_item or columns_used > 0)
    // but no citations and the source Finding had citations, that's a
    // dropped citation, fail.
    const finding = findings.find((f) => f.source_query_id === b.source_query_id);
    const findingHadCitations =
      finding != null && finding.citations.length > 0;
    if (
      findingHadCitations &&
      b.citations.length === 0 &&
      (b.action_item != null || b.columns_used.length > 0)
    ) {
      return {
        ok: false,
        error: `Bullet ${i} ("${b.claim.slice(0, 60)}…") dropped the source Finding's citations.`,
      };
    }
  }
  return { ok: true };
}

export async function quill(
  state: HermesState,
): Promise<HermesStateUpdate> {
  const startedAt = new Date().toISOString();

  if (!state.intent || state.findings.length === 0) {
    return {
      bullets: [],
      history: [
        {
          node: "quill",
          started_at: startedAt,
          ended_at: new Date().toISOString(),
          notes: state.intent
            ? "skipped: no findings to write up"
            : "skipped: no intent",
        },
      ],
    };
  }

  const intent = state.intent;

  // Tone retrieve: prior bullets for the same client + primary channel.
  // Falls back to empty on RAG failure.
  let toneRefs: ContextChunk[] = [];
  try {
    const r = await retrieve({
      corpus: "history",
      query: `${intent.client} ${intent.channels[0] ?? ""} bullets`,
      filters: { client: intent.client },
      k: 6,
    });
    toneRefs = r.chunks.map((c) => ({
      chunk_id: c.chunk_id,
      source_path: c.source_path,
      content: c.content,
      similarity: c.similarity,
    }));
  } catch (err) {
    console.warn({
      event: "hermes.quill.tone_retrieve_failed",
      run_id: state.run_id,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const response = await getAnthropicClient().messages.create({
    model: pickModel("sonnet"),
    max_tokens: 2048,
    system: [
      {
        type: "text",
        text: QUILL_SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: [
      {
        name: TOOL_NAME,
        description: "Turn ranked Findings into citation-bound bullets.",
        input_schema: TOOL_INPUT_SCHEMA,
        cache_control: { type: "ephemeral" },
      },
    ],
    tool_choice: { type: "tool", name: TOOL_NAME },
    messages: [
      {
        role: "user",
        content: buildUserMessage({
          client: intent.client,
          channels: intent.channels,
          findings: state.findings,
          toneRefs,
        }),
      },
    ],
  });

  const toolUse = response.content.find(
    (block) => block.type === "tool_use" && block.name === TOOL_NAME,
  );
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("quill: Sonnet returned no tool_use block.");
  }
  const parsed = BulletsResponseSchema.parse(toolUse.input);
  const bullets: Bullet[] = parsed.bullets;

  // Hard validator. Run-blocking; trust contract for the whole demo.
  const verdict = validateBullets(bullets, state.findings);
  if (!verdict.ok) {
    throw new Error(`quill validator failed: ${verdict.error}`);
  }

  // Tone memory: store the bullets so future runs can pattern-match.
  try {
    await rememberSlice(`quill`, intent.client, {
      bullets,
      channels: intent.channels,
    });
  } catch (err) {
    console.warn({
      event: "hermes.quill.remember_slice_failed",
      run_id: state.run_id,
      client: intent.client,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return {
    bullets,
    context: {
      knowledge: state.context.knowledge,
      history: [...state.context.history, ...toneRefs],
      comms: state.context.comms,
    },
    history: [
      {
        node: "quill",
        started_at: startedAt,
        ended_at: new Date().toISOString(),
        notes: `bullets=${bullets.length} tone_refs=${toneRefs.length}`,
      },
    ],
  };
}
