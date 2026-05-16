import type { HighlightToken, ParsedProse } from "./types";

// Highlight-markup parser.
//
// The prose-writer LLM is instructed to emit inline highlights using
// `{{good}}...{{/good}}` and `{{bad}}...{{/bad}}` token pairs. Phase 1
// renders these as colored fills (yellow for good, pink for bad) in
// both the pptx export and the on-screen carousel. Phase 3 will add a
// third arrow-shaped token that links a phrase to a specific row in
// the campaign table.
//
// Why a custom tag instead of Markdown or HTML
// --------------------------------------------
// Markdown doesn't have a canonical highlight syntax (only some flavors
// support `==text==`). HTML opens an injection surface the renderer
// would have to sanitize against the LLM output anyway. Custom
// `{{...}}` tags are unambiguous, easy to grep for in prompt failures,
// and easy to swap if the LLM produces malformed output (a stray
// opening tag silently drops the rest of the line rather than crashing
// the runner).
//
// Robustness behavior
// -------------------
// - Nested tokens are not supported. A `{{good}}{{bad}}…{{/bad}}{{/good}}`
//   sequence is treated as two flat tokens; the outer wrap is dropped.
// - Unclosed tokens are dropped (kept as plain text). The validator
//   does not fail on malformed markup, but it counts the unparseable
//   spans so diagnostics surface them.
// - Empty tokens (`{{good}}{{/good}}`) are dropped.

// Seven recognized kinds. "good" / "bad" are the semantic callouts
// (yellow / coral); pink / orange / blue / green / violet are the
// campaign-breakdown row-arrow color markers that bind a bullet
// phrase to its matching colored arrow in the table.
const HIGHLIGHT_KIND_PATTERN = "good|bad|pink|orange|blue|green|violet";
const TOKEN_RE = new RegExp(
  `\\{\\{(${HIGHLIGHT_KIND_PATTERN})\\}\\}([\\s\\S]*?)\\{\\{\\/\\1\\}\\}`,
  "g",
);

/**
 * Parse highlight markup out of a prose string, returning:
 *   - text:   the prose with each `{{kind}}…{{/kind}}` block replaced
 *             by a stable placeholder `[[highlight:N]]`
 *   - tokens: the resolved highlight tokens, indexed by N
 *
 * Never throws. A malformed input string returns `{text: input, tokens: []}`.
 */
export function parseHighlightMarkup(input: string): ParsedProse {
  if (typeof input !== "string" || input.length === 0) {
    return { text: input ?? "", tokens: [] };
  }

  const tokens: HighlightToken[] = [];
  let out = "";
  let cursor = 0;

  // Reset regex state in case the module is reused inside a loop.
  TOKEN_RE.lastIndex = 0;
  for (let m = TOKEN_RE.exec(input); m != null; m = TOKEN_RE.exec(input)) {
    const [full, kindRaw, inner] = m;
    const kind = kindRaw as HighlightToken["kind"];
    const text = inner.trim();
    if (text.length === 0) {
      // Empty highlights are dropped silently; carry through the
      // prose surrounding the empty pair.
      out += input.slice(cursor, m.index);
      cursor = m.index + full.length;
      continue;
    }
    out += input.slice(cursor, m.index);
    out += `[[highlight:${tokens.length}]]`;
    tokens.push({ kind, text });
    cursor = m.index + full.length;
  }
  out += input.slice(cursor);

  return { text: out, tokens };
}

/**
 * Round-trip the parser: take a parsed structure and emit the original
 * `{{good}}…{{/good}}` markup. Used in tests and as a debug aid; the
 * renderer doesn't need this because it walks placeholders directly.
 */
export function reconstructMarkup(parsed: ParsedProse): string {
  return parsed.text.replace(/\[\[highlight:(\d+)\]\]/g, (_full, indexStr) => {
    const idx = Number(indexStr);
    const token = parsed.tokens[idx];
    if (!token) return "";
    return `{{${token.kind}}}${token.text}{{/${token.kind}}}`;
  });
}

/**
 * Count unclosed markup tags in the input. Used by composeReport's
 * diagnostics to surface prompt failures: when the LLM emits an
 * opening token without its matching close, the parser silently
 * drops it. Knowing the unclosed count helps tune the prompt.
 */
export function countUnclosedTags(input: string): number {
  if (typeof input !== "string") return 0;
  const openRe = new RegExp(`\\{\\{(${HIGHLIGHT_KIND_PATTERN})\\}\\}`, "g");
  const closeRe = new RegExp(`\\{\\{\\/(${HIGHLIGHT_KIND_PATTERN})\\}\\}`, "g");
  const opening = (input.match(openRe) ?? []).length;
  const closing = (input.match(closeRe) ?? []).length;
  return Math.max(0, opening - closing);
}
