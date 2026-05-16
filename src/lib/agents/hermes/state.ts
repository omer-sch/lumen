import { Annotation } from "@langchain/langgraph";
import { z } from "zod";

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

// ---------- Deck (Atelier output, stubbed in chunk 1) ----------

export type DeckSlide = {
  index: number;
  layout: string;
  title: string;
};

export type Deck = {
  pptx_path: string | null;
  slides: DeckSlide[];
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
    }),
    default: () => ({ pptx_path: null, slides: [] }),
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
