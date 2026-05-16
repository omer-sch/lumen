import type { ReadyData } from "@/lib/analyst/types";

import type { ProseBlock, ProseCitation } from "./types";

// Citation validator. Phase 1 trust contract: every prose block that
// makes a numeric claim cites a queryId from the underlying ReadyData
// provenance. The validator fails the compose run when a block cites
// an id we did not actually fetch.
//
// Two pieces:
//   1. extractCitations(): pulls citation tokens out of the prose. The
//      prose-writer is instructed to emit citations inline as
//      `[cite:network-breakdown]` immediately after the claim. The
//      tokens are stripped before render; only the queryId metadata
//      survives.
//   2. validateCitations(): cross-checks each citation against the
//      ReadyData.provenance.queryIds and the AnalystFinding-level
//      provenance. Returns a structured verdict so the caller can
//      either throw (live mode) or just log (shadow mode).

const CITE_RE = /\[cite:([a-z0-9_\-]+)(?::([^\]]+))?\]/gi;

/**
 * Extract `[cite:queryId]` tokens from a prose string and return:
 *   - text: prose with the citation tokens stripped (so the renderer
 *           emits clean copy)
 *   - citations: the structured list, in order
 */
export function extractCitations(prose: string): {
  text: string;
  citations: ProseCitation[];
} {
  if (typeof prose !== "string" || prose.length === 0) {
    return { text: prose ?? "", citations: [] };
  }
  const citations: ProseCitation[] = [];
  CITE_RE.lastIndex = 0;
  const text = prose.replace(CITE_RE, (_full, queryId, excerpt) => {
    citations.push({
      queryId: String(queryId).toLowerCase(),
      excerpt: typeof excerpt === "string" ? excerpt : undefined,
    });
    return "";
  }).replace(/\s+([.,;:!?])/g, "$1") // collapse the orphan space left
    .replace(/\s{2,}/g, " ")           // before punctuation when the
    .trim();                            // citation was mid-sentence.
  return { text, citations };
}

// ── Validator ──────────────────────────────────────────────────────────

export type ValidatorVerdict =
  | { ok: true; citationCount: number }
  | { ok: false; error: string; offender: { blockIndex: number; queryId: string } };

/**
 * Validate that every citation in every prose block references a
 * queryId present in ReadyData.provenance.queryIds. The provenance
 * list is a superset of every individual finding's queryIds, so
 * passing the ReadyData itself is sufficient.
 *
 * Returns the verdict; never throws. Callers decide whether to throw
 * on `ok: false` (live mode) or log (shadow mode).
 */
export function validateCitations(
  blocks: ProseBlock[],
  readyData: ReadyData,
  blockCitations: ProseCitation[][],
): ValidatorVerdict {
  const knownIds = new Set(
    readyData.provenance.queryIds.map((q) => q.toLowerCase()),
  );
  let total = 0;
  for (let i = 0; i < blocks.length; i++) {
    const cites = blockCitations[i] ?? [];
    for (const c of cites) {
      total += 1;
      if (!knownIds.has(c.queryId)) {
        return {
          ok: false,
          error: `Prose block ${i} cites unknown queryId "${c.queryId}". Known: ${[...knownIds].join(", ") || "(none)"}.`,
          offender: { blockIndex: i, queryId: c.queryId },
        };
      }
    }
  }
  return { ok: true, citationCount: total };
}

/**
 * Helper for the prose-writer's diagnostics: count how many prose
 * blocks have at least one citation, and how many have none. A block
 * with no citations is a soft failure — it's allowed (a pure tone
 * paragraph carries no numbers), but the diagnostic is worth logging.
 */
export function summarizeCitationCoverage(
  blockCitations: ProseCitation[][],
): { cited: number; uncited: number } {
  let cited = 0;
  let uncited = 0;
  for (const cs of blockCitations) {
    if (cs.length > 0) cited += 1;
    else uncited += 1;
  }
  return { cited, uncited };
}
