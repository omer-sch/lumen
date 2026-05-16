import { Annotation } from "@langchain/langgraph";
import { z } from "zod";

import type {
  CampaignRow as ReportCampaignRow,
  HistoricalWeekRow,
  WeeklySummaryRow,
} from "@/lib/reports/types";

// Hermes graph state. Two flavors:
//   - HermesStateAnnotation: LangGraph's typed state shape. Each field
//     gets a reducer (how an update folds in) and a default. parse_intent
//     and the stubs return partial state objects that LangGraph merges
//     using these reducers.
//   - The Zod schemas below validate at boundaries: tool_use outputs
//     from the LLM, API-route request bodies, and persistence.

// ---------- Intent (parse_intent output) ----------

export const IntentSchema = z.object({
  client: z.string().min(1),
  platforms: z.array(z.enum(["android", "ios", "web"])).min(1),
  channels: z
    .array(z.enum(["meta", "google", "tiktok", "apple_search_ads", "applovin"]))
    .min(1),
  period: z.object({
    label: z.string(),
    iso_start: z.string().nullable(),
    iso_end: z.string().nullable(),
  }),
  // focus + doubts are tolerant of Haiku omitting them. Either Zod path
  // (.nullable().optional() / .default([])) matches what the tool
  // schema declares optional. Phase 3's adversarial fixtures lock this
  // contract in further.
  focus: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1),
  doubts: z.array(z.string()).default([]),
});
export type Intent = z.infer<typeof IntentSchema>;

// ---------- Context (RAG-retrieved chunks per source) ----------

export type ContextChunk = {
  chunk_id: string;
  source_path: string;
  content: string;
  similarity: number;
};

export type Context = {
  knowledge: ContextChunk[];
  history: ContextChunk[];
  comms: ContextChunk[];
};

// ---------- Findings (Analyze output) ----------

export const FindingSchema = z.object({
  kind: z.enum(["anomaly", "trend", "highlight", "info"]),
  claim_template: z.string().min(1),
  delta: z.number().nullable().optional(),
  source_query_id: z.string().min(1),
  citations: z
    .array(
      z.object({
        source_path: z.string(),
        chunk_id: z.string(),
      }),
    )
    .default([]),
  severity: z.enum(["low", "medium", "high"]),
});
export type Finding = z.infer<typeof FindingSchema>;

export const FindingsResponseSchema = z.object({
  findings: z.array(FindingSchema).max(20),
});

// ---------- Bullets (Quill output) ----------

export const SLIDE_TARGETS = [
  "platform_overall",
  "channel_weekly",
  "campaign_breakdown",
  "closing",
] as const;
export type SlideTarget = (typeof SLIDE_TARGETS)[number];

export const BulletSchema = z.object({
  claim: z.string().min(1),
  columns_used: z.array(z.string()).default([]),
  source_query_id: z.string().min(1),
  delta_value: z.number().nullable().default(null),
  action_item: z.string().nullable().default(null),
  citations: z.array(
    z.object({
      source_path: z.string(),
      chunk_id: z.string(),
    }),
  ),
  slide_target: z.enum(SLIDE_TARGETS),
});
export type Bullet = z.infer<typeof BulletSchema>;

export const BulletsResponseSchema = z.object({
  bullets: z.array(BulletSchema).max(20),
});

// ---------- Contact (recognised inbound email sender) ----------

export type HermesContact = {
  id: string;
  name: string;
  email: string;
  role: string | null;
  clientId: string;
};

// ---------- Snapshot (structural data tables sourced by Analyze) ----------

// The structured tables Atelier needs to assemble a Report whose
// sections render at the same fidelity as a manually-built one. Analyze
// produces this from BQ where data exists and falls back to mock
// fixtures (cloned from src/lib/reports/generate.ts) where it does not,
// so the Report renders fully even when BQ is sparse. As BQ data
// quality improves the snapshot picks up real values without any
// downstream change.
export type HermesSnapshot = {
  clientLabel: string;
  period: {
    label: string;
    filterRange?: string;
    isoStart?: string | null;
    isoEnd?: string | null;
  };
  /** Describes the scope of the data in the snapshot vs. what the intent
   *  asked for. "client-wide-all-platforms" means BQ returned numbers
   *  across every platform the client runs on, not just the intent's
   *  platform. The warehouse spend tables do not expose a uniform OS
   *  column at the No-Breakdown grain so the snapshot can't filter
   *  honestly. "platform-filtered" is the future state once the BQ
   *  pipeline gains a real platform predicate. The assembler uses this
   *  to decide whether the deck headers can claim the intent's platform
   *  or have to stay generic. */
  dataScope: "client-wide-all-platforms" | "platform-filtered";
  platformOverall: {
    rows: WeeklySummaryRow[];
    total: WeeklySummaryRow;
  } | null;
  channelWeekly: {
    currentWeek: WeeklySummaryRow;
    history: HistoricalWeekRow[];
  } | null;
  channelCampaign: {
    rows: ReportCampaignRow[];
  } | null;
};

// ---------- Deck (Atelier output) ----------

// Phase 6 wrote a server-side .pptx via pptxgenjs. v0.5-A chunk 4
// replaces that with a Supabase reports-row insert; the .pptx export
// path is the existing client-side renderer in src/lib/reports/
// export-pptx.ts, fired by Lior from the /reports surface. The Deck
// slot kept for trace compatibility; pptx_path is always null now.
export type DeckSlide = {
  index: number;
  layout: string;
  title: string;
};

export type Deck = {
  pptx_path: string | null;
  slides: DeckSlide[];
  report_id?: string | null;
};

// ---------- Approval (review_gate state) ----------

export type Approval = {
  approved: boolean;
  approved_by: string | null;
  approved_at: string | null;
  edits: Array<{ bullet_index: number; original: string; revised: string }>;
};

// ---------- History trace (per-node breadcrumb) ----------

export type HistoryEvent = {
  node: string;
  started_at: string;
  ended_at: string;
  notes?: string;
};

// ---------- LangGraph Annotation ----------

export const HermesStateAnnotation = Annotation.Root({
  email_text: Annotation<string>(),
  run_id: Annotation<string | null>({
    reducer: (a, b) => b ?? a,
    default: () => null,
  }),
  // Owner of the report Atelier writes. Passed from the API route
  // (Clerk userId or "preview-user" under LUMEN_PREVIEW); never read
  // from the LLM. Atelier hands it to upsertReport() as the row owner.
  user_id: Annotation<string | null>({
    reducer: (a, b) => b ?? a,
    default: () => null,
  }),
  intent: Annotation<Intent | null>({
    reducer: (_a, b) => b,
    default: () => null,
  }),
  context: Annotation<Context>({
    reducer: (a, b) => ({
      knowledge: b.knowledge ?? a.knowledge,
      history: b.history ?? a.history,
      comms: b.comms ?? a.comms,
    }),
    default: () => ({ knowledge: [], history: [], comms: [] }),
  }),
  // Recognised sender of the inbound email. Set by parse_intent when
  // the body carries an email address that maps to a client_contacts
  // row. Atelier reads it for the "Prepared for ..." byline; the
  // future review_gate Gmail reply prefill uses it for the salutation.
  contact: Annotation<HermesContact | null>({
    reducer: (_a, b) => b,
    default: () => null,
  }),
  snapshot: Annotation<HermesSnapshot | null>({
    reducer: (_a, b) => b,
    default: () => null,
  }),
  findings: Annotation<Finding[]>({
    reducer: (_a, b) => b,
    default: () => [],
  }),
  bullets: Annotation<Bullet[]>({
    reducer: (_a, b) => b,
    default: () => [],
  }),
  deck: Annotation<Deck>({
    reducer: (a, b) => ({
      pptx_path: b.pptx_path ?? a.pptx_path,
      slides: b.slides ?? a.slides,
      report_id: b.report_id ?? a.report_id,
    }),
    default: () => ({ pptx_path: null, slides: [], report_id: null }),
  }),
  approval: Annotation<Approval>({
    reducer: (a, b) => ({ ...a, ...b }),
    default: () => ({
      approved: false,
      approved_by: null,
      approved_at: null,
      edits: [],
    }),
  }),
  // `history` updates MUST be an array,every node returns
  // `history: [{...}]`, never a bare object. A future node returning a
  // single event without wrapping it in [] would silently break the
  // concat below. Enforced by the HermesStateUpdate type at the
  // function-signature level.
  history: Annotation<HistoryEvent[]>({
    reducer: (a, b) => a.concat(b),
    default: () => [],
  }),
});

export type HermesState = typeof HermesStateAnnotation.State;
export type HermesStateUpdate = Partial<HermesState>;

// ---------- API boundary ----------

export const GenerateRequestSchema = z.object({
  email_text: z.string().min(30).max(20_000),
});
export type GenerateRequest = z.infer<typeof GenerateRequestSchema>;
