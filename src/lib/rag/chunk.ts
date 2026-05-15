import { createHash } from "node:crypto";
import { Tiktoken } from "js-tiktoken";
import cl100k_base from "js-tiktoken/ranks/cl100k_base";

// Pure functions: chunk a markdown source into ~512 token windows with
// 64 token overlap. chunk_id is sha256(source).slice(0,8) + '-' + index
// so re-indexing the same source produces identical chunk_ids and
// upserts cleanly; a changed source mints fresh ids and the indexer is
// expected to prune stale rows for that source_path.
//
// cl100k_base is the encoding text-embedding-3-large uses, so the token
// budget here matches what OpenAI will see at embed time.

const TARGET_TOKENS = 512;
const OVERLAP_TOKENS = 64;

let _encoder: Tiktoken | null = null;
function encoder(): Tiktoken {
  if (!_encoder) _encoder = new Tiktoken(cl100k_base);
  return _encoder;
}

export type Chunk = {
  content: string;
  chunk_id: string;
  tokens: number;
  position: number;
};

function sha256Prefix(content: string): string {
  return createHash("sha256").update(content).digest("hex").slice(0, 8);
}

function splitByH2(content: string): string[] {
  // Keep the heading attached to the section it introduces. The
  // lookahead anchors the split at the start of each `## ` heading
  // line. If no headings appear, returns a single-element array with
  // the whole input.
  const parts = content.split(/^(?=## )/m);
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

function chunkBySlidingWindow(
  text: string,
  target: number,
  overlap: number,
): Array<{ content: string; tokens: number }> {
  const enc = encoder();
  const tokens = enc.encode(text);
  if (tokens.length === 0) return [];
  if (tokens.length <= target) {
    return [{ content: text, tokens: tokens.length }];
  }
  const out: Array<{ content: string; tokens: number }> = [];
  let i = 0;
  while (i < tokens.length) {
    const end = Math.min(i + target, tokens.length);
    const slice = tokens.slice(i, end);
    out.push({ content: enc.decode(slice), tokens: slice.length });
    if (end >= tokens.length) break;
    i = end - overlap;
  }
  return out;
}

export function chunkMarkdown(content: string): Chunk[] {
  if (!content || content.trim().length === 0) return [];
  const prefix = sha256Prefix(content);
  const sections = splitByH2(content);
  const out: Chunk[] = [];
  for (const section of sections) {
    const pieces = chunkBySlidingWindow(section, TARGET_TOKENS, OVERLAP_TOKENS);
    for (const piece of pieces) {
      out.push({
        content: piece.content,
        tokens: piece.tokens,
        position: out.length,
        chunk_id: `${prefix}-${out.length}`,
      });
    }
  }
  return out;
}

// Exposed for tests and for indexer code that wants the same encoder
// instance, e.g. to budget batch sizes.
export function countTokens(text: string): number {
  return encoder().encode(text).length;
}
