import type { Report } from "@/lib/reports/types";
import type { Intent, ReadyData } from "@/lib/analyst/types";

// Smart Reports — the LLM-powered prose layer that sits between the
// shared analyst (deterministic data + findings + provenance) and the
// renderer (deterministic pptx + DOM). Phase 1 ships a single template,
// `single-channel-weekly`, matching today's Hermes scope: one platform,
// one channel, one weekly breakdown slide + one campaign breakdown
// slide. Multi-section orchestration and cross-platform synthesis are
// the Phase 2 / 3 expansions.
//
// Why a separate module from the renderer
// ---------------------------------------
// Today's Hermes pipeline interleaves "rank findings (Sonnet)" -> "draft
// bullets (Sonnet)" -> "assemble Report (deterministic)". The Phase 1
// rewrite consolidates "rank + draft + assemble" into one component
// that reads ReadyData (already maturity-gated, already provenance-
// stamped) and emits a Report directly. The renderer keeps its
// existing role; the LLM responsibility shrinks to prose + section-
// scoped framing rather than judgement about what data to surface
// (that lives in the analyst now).

// ── Template ──────────────────────────────────────────────────────────

/**
 * Deck-shape templates. Phase 1 ships only `single-channel-weekly`
 * (Hermes parity); Phase 2 adds `weekly-review-globalcomix` (full
 * multi-platform structure). The template drives which sections
 * composeReport asks the prose-writer for and in what order.
 */
export type ComposeTemplate =
  | "single-channel-weekly"
  | "weekly-review-globalcomix";

// ── Highlight markup ──────────────────────────────────────────────────

/**
 * Structured form of the inline highlight tokens the prose-writer
 * emits. Two render styles today:
 *   - "good"  yellow background, bold text (positive callout)
 *   - "bad"   pink  background, bold text (negative callout)
 *
 * Phase 3 will add `arrow` tokens that link a phrase to a specific
 * row in the campaign table. The shape stays additive — a future
 * `{kind: "arrow", rowId: string, text: string}` slots in without
 * a breaking change.
 */
export type HighlightToken =
  | { kind: "good"; text: string }
  | { kind: "bad"; text: string };

/**
 * The output of the markup parser: the prose with the markup tokens
 * stripped and replaced with stable placeholder markers
 * `[[highlight:N]]`, plus the resolved tokens in order. Renderers
 * (DOM + pptx) walk the placeholders and substitute the styled span.
 */
export type ParsedProse = {
  /** Prose with `{{good}}...{{/good}}` / `{{bad}}...{{/bad}}` blocks
   *  replaced by `[[highlight:N]]` placeholders. */
  text: string;
  /** Resolved tokens, indexed by N. Matches the placeholder order. */
  tokens: HighlightToken[];
};

// ── Prose blocks ──────────────────────────────────────────────────────

/**
 * One unit of prose emitted by the prose-writer. Sections may carry
 * multiple blocks (e.g. one paragraph per campaign family in the
 * campaign-breakdown section). Each block keeps the highlight tokens
 * with it so the renderer can resolve them locally without scanning
 * the full report.
 */
export type ProseBlock = {
  /** Optional sub-heading shown above the prose ("Sub (Evergreen)").
   *  Used by the campaign-breakdown section to group rows by family.
   *  Empty / undefined when the prose is a single flowing paragraph. */
  heading?: string;
  /** Prose with `[[highlight:N]]` placeholders. */
  text: string;
  /** Resolved highlight tokens in placeholder order. */
  highlights: HighlightToken[];
};

// ── Citation contract ─────────────────────────────────────────────────

/**
 * A claim the prose-writer made carries a query id from the underlying
 * ReadyData provenance. The validator pulls these out, checks each
 * `queryId` against the queryIds the ReadyData fetched, and fails the
 * run if a prose block cites an id we don't recognise.
 */
export type ProseCitation = {
  /** The query id (matches a value in ReadyData.provenance.queryIds). */
  queryId: string;
  /** Optional brief excerpt of the claim the citation backs. Useful
   *  in the validator's error message. */
  excerpt?: string;
};

// ── Compose options + result ──────────────────────────────────────────

export type ComposeOptions = {
  template: ComposeTemplate;
  /** Model tier override for the prose-writer call. Default "sonnet"
   *  for quality; "haiku" is available for low-stakes Phase 1
   *  experimentation. */
  modelHint?: "haiku" | "sonnet";
  /** Optional free-text analyst notes from the manual builder or the
   *  Hermes paste-email modal ("we paused the Invincible campaign last
   *  week"). Phase 1 does not weave these into prose (that lands in
   *  Phase 3); the option exists so callers can already pass it in
   *  without a signature change later. */
  actionNotes?: string;
};

/**
 * What `composeReport` returns. Phase 1 ships a Report shaped exactly
 * like what `assembleHermesReport` produces today, plus the per-section
 * prose blocks. The Report type from `src/lib/reports/types.ts`
 * already accepts the prose extension as additive on the section
 * union; the renderer falls back to the existing bullet rendering when
 * a section has no prose block.
 */
export type ComposedReport = {
  report: Report;
  /** Diagnostics surfaced to logs / shadow comparisons. Never
   *  rendered. */
  diagnostics: {
    sectionsEmitted: string[];
    proseBlocks: number;
    highlights: number;
    citationsValidated: number;
    prompTokensIn: number;
    promptTokensOut: number;
  };
};

// Re-exports for callers that only need to depend on this module.
export type { ReadyData, Intent };
