import "server-only";

import * as fs from "node:fs";
import * as path from "node:path";

import { getAnthropicClient, pickModel } from "@/lib/agents/_scaffold/model";
import type {
  AnalystFinding,
  ReadyData,
  WeeklyHistoryRow,
} from "@/lib/analyst/types";
import type { NetworkRow as BQNetworkRow } from "@/types/dashboard";
import type { CalloutColor } from "@/lib/reports/types";

import { actionItemsAsContextString } from "./action-items";
import type { ActionItem } from "./action-items";
import { extractCitations } from "./citation-validator";
import {
  countUnclosedTags,
  parseHighlightMarkup,
} from "./highlight-markup";
import {
  freshnessAsContextString,
  type FreshnessSummary,
} from "./freshness";
import type {
  ComposeOptions,
  ProseBlock,
  ProseBullet,
  ProseCitation,
} from "./types";

// Prose-writer. Single Sonnet tool_use call per section. The writer
// emits a structured shape -- 2 to 4 bullets + a "Bottom line"
// sentence per block -- instead of the old single-paragraph prose.
// Three flavors today (one prompt + tool per section type):
//
//   - weekly-breakdown: one block describing the platform/channel
//     performance for the current period.
//   - campaign-breakdown: one block per campaign family in the data.
//   - platform-overall: one block per channel that ran spend on the
//     platform during the period.
//
// Per-block highlight markup ({{good}}/{{bad}} and pink/orange/blue/
// green/violet) is parsed at the bullet level so each bullet carries
// its own highlight scope. Citation tokens [cite:queryId] are
// extracted before markup parsing so the validator can cross-check
// them against ReadyData.provenance.

// ── Prompt loading ─────────────────────────────────────────────────────

const PROMPTS_DIR = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "prompts",
);

function loadPrompt(
  name: "weekly-breakdown" | "campaign-breakdown" | "platform-overall" | "closer",
): string {
  const file = path.join(PROMPTS_DIR, `${name}.md`);
  return fs.readFileSync(file, "utf-8");
}

// ── Tool schemas ───────────────────────────────────────────────────────
//
// The shared "bullets array of {text}" shape keeps the tool input
// uniform across writers; the consuming code does its own
// citation + markup parsing on each bullet's text.

const BULLETS_PROPERTY = {
  type: "array" as const,
  minItems: 2,
  maxItems: 4,
  items: {
    type: "object" as const,
    properties: {
      text: { type: "string" as const },
    },
    required: ["text"],
  },
};

const WEEKLY_TOOL_NAME = "write_weekly_breakdown";
const WEEKLY_TOOL_INPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    bullets: BULLETS_PROPERTY,
    bottomLine: { type: "string" as const },
  },
  required: ["bullets", "bottomLine"],
};

const CAMPAIGN_TOOL_NAME = "write_campaign_breakdown";
const CAMPAIGN_TOOL_INPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    blocks: {
      type: "array" as const,
      maxItems: 12,
      items: {
        type: "object" as const,
        properties: {
          heading: { type: "string" as const },
          bullets: BULLETS_PROPERTY,
          bottomLine: { type: "string" as const },
          actionItem: { type: "string" as const },
        },
        required: ["heading", "bullets", "bottomLine"],
      },
    },
  },
  required: ["blocks"],
};

const PLATFORM_OVERALL_TOOL_NAME = "write_platform_overall";
const PLATFORM_OVERALL_TOOL_INPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    blocks: {
      type: "array" as const,
      maxItems: 8,
      items: {
        type: "object" as const,
        properties: {
          heading: { type: "string" as const },
          bullets: BULLETS_PROPERTY,
          bottomLine: { type: "string" as const },
        },
        required: ["heading", "bullets", "bottomLine"],
      },
    },
  },
  required: ["blocks"],
};

// ── Block builder ──────────────────────────────────────────────────────

type RawBlockInput = {
  heading?: unknown;
  bullets?: unknown;
  bottomLine?: unknown;
  actionItem?: unknown;
};

type BuiltBlock = {
  block: ProseBlock;
  citations: ProseCitation[];
  unclosedTags: number;
};

// Parse one writer-emitted block into the typed ProseBlock + flattened
// citation list. Each bullet's citations are merged into the block's
// citation list so the validator can fail the run when an id is
// unknown. Highlights are parsed per-bullet so placeholder indexes
// stay local. Empty bullets are dropped silently; a block that ends
// up with zero bullets after sanitisation is skipped by the caller.
function buildBlockFromRaw(raw: RawBlockInput): BuiltBlock | null {
  const heading =
    typeof raw.heading === "string" && raw.heading.length > 0
      ? raw.heading
      : undefined;

  const bottomLineRaw =
    typeof raw.bottomLine === "string" ? raw.bottomLine : "";
  // The bottomLine is plain copy per the prompt contract -- strip any
  // stray citation tokens or markup so the renderer never paints a
  // raw [[highlight:N]] placeholder if the writer disobeyed.
  const { text: bottomLineStripped } = extractCitations(bottomLineRaw);
  const bottomLine = parseHighlightMarkup(bottomLineStripped).text.trim();

  const actionItem =
    typeof raw.actionItem === "string" && raw.actionItem.trim().length > 0
      ? raw.actionItem.trim()
      : undefined;

  const rawBullets = Array.isArray(raw.bullets) ? raw.bullets : [];
  const bullets: ProseBullet[] = [];
  const citations: ProseCitation[] = [];
  let unclosedTags = 0;

  for (const b of rawBullets) {
    const bulletText =
      b != null && typeof (b as { text?: unknown }).text === "string"
        ? ((b as { text: string }).text as string)
        : "";
    if (bulletText.length === 0) continue;
    unclosedTags += countUnclosedTags(bulletText);
    const { text: stripped, citations: bulletCites } =
      extractCitations(bulletText);
    const parsed = parseHighlightMarkup(stripped);
    bullets.push({ text: parsed.text, highlights: parsed.tokens });
    citations.push(...bulletCites);
  }

  if (bullets.length === 0) return null;

  return {
    block: { heading, bullets, bottomLine, actionItem },
    citations,
    unclosedTags,
  };
}

// ── Data slicing helpers ───────────────────────────────────────────────

// Pull the ReadyData slice the weekly-breakdown writer needs: the
// current-period row for the requested channel, plus the per-week
// trailing rows for the same channel. Returns null when the channel
// has no current-period spend (no slide gets emitted).
function sliceWeekly(
  ready: ReadyData,
  bqNetworkNames: readonly string[],
): { current: BQNetworkRow; history: WeeklyHistoryRow[] } | null {
  const current = ready.networks.find((n) =>
    bqNetworkNames.includes(n.network),
  );
  if (!current) return null;
  const history = ready.history.networks.filter((h) =>
    bqNetworkNames.includes(h.network),
  );
  // Oldest-first; the prose-writer references "vs Week N-2/N-3 levels"
  // by reading down the list.
  history.sort((a, b) => a.weekIsoStart.localeCompare(b.weekIsoStart));
  return { current, history };
}

// Group enriched campaign rows by family, in spend-descending order so
// the prose-writer sees the highest-spend family first.
function groupCampaignsByFamily(
  ready: ReadyData,
  bqNetworkNames: readonly string[],
  platform?: "android" | "ios" | "web",
): { family: string; totalSpend: number; rows: ReadyData["campaigns"] }[] {
  const filtered = ready.campaigns.filter((c) => {
    if (!bqNetworkNames.includes(c.network)) return false;
    if (platform) {
      // Classifier sets platform from the campaign name (iOS /
      // Android / Web). Empty / non-matching campaigns are dropped
      // so a per-platform chapter does not surface foreign rows.
      if (!c.platform) return false;
      if (c.platform.toLowerCase() !== platform) return false;
    }
    return true;
  });
  const byFamily = new Map<string, ReadyData["campaigns"]>();
  for (const c of filtered) {
    const arr = byFamily.get(c.family) ?? [];
    arr.push(c);
    byFamily.set(c.family, arr);
  }
  const out: { family: string; totalSpend: number; rows: ReadyData["campaigns"] }[] = [];
  for (const [family, rows] of byFamily) {
    const totalSpend = rows.reduce((a, r) => a + r.spend, 0);
    out.push({ family, totalSpend, rows });
  }
  out.sort((a, b) => b.totalSpend - a.totalSpend);
  return out;
}

// ── Findings selection ────────────────────────────────────────────────
//
// The analyst layer has already detected anomalies with maturity gates
// and stable provenance. Feeding the relevant ones to the writer makes
// it lead with deterministic findings instead of re-deriving from raw
// rows. Each writer takes a different slice:
//   - weekly-breakdown: findings on networks matching the channel.
//   - campaign-breakdown: findings on campaigns inside any family
//     group, plus network-level findings on the channel.
//   - platform-overall: findings on any network on the platform.

type FindingDetails = {
  network?: string;
  campaign_id?: string;
};

function findingNetwork(f: AnalystFinding): string | undefined {
  const details = f.details as FindingDetails;
  return typeof details.network === "string" ? details.network : undefined;
}

function findingCampaignId(f: AnalystFinding): string | undefined {
  const details = f.details as FindingDetails;
  return typeof details.campaign_id === "string"
    ? details.campaign_id
    : undefined;
}

function findingsForNetworks(
  ready: ReadyData,
  bqNetworkNames: readonly string[],
): AnalystFinding[] {
  return ready.anomalies.filter((f) => {
    const net = findingNetwork(f);
    return Boolean(net && bqNetworkNames.includes(net));
  });
}

function findingsForCampaigns(
  ready: ReadyData,
  bqNetworkNames: readonly string[],
  campaignIds: Set<string>,
): AnalystFinding[] {
  return ready.anomalies.filter((f) => {
    const cid = findingCampaignId(f);
    if (cid && campaignIds.has(cid)) return true;
    const net = findingNetwork(f);
    return Boolean(net && bqNetworkNames.includes(net));
  });
}

function renderFindingsBlock(findings: AnalystFinding[]): string {
  if (findings.length === 0) return "";
  const lines = findings.map((f) => {
    const queries = f.provenance.queryIds.join(", ");
    return `- [${f.severity}] ${f.summary} (algorithm: ${f.provenance.algorithm}; queries: ${queries})`;
  });
  return [
    "",
    "<findings>",
    "These findings were computed deterministically by the analyst layer. Each carries a stable id and provenance. Lead with these in your bullets; do not invent findings not in this list. Cite the listed queryIds when referencing the underlying numbers.",
    "",
    ...lines,
    "</findings>",
  ].join("\n");
}

// ── Writer: weekly-breakdown ───────────────────────────────────────────

export type WeeklyWriteResult = {
  blocks: ProseBlock[];
  blockCitations: ProseCitation[][];
  diagnostics: {
    unclosedHighlightTags: number;
    promptTokensIn: number;
    promptTokensOut: number;
  };
};

export async function writeWeeklyBreakdown(args: {
  ready: ReadyData;
  bqNetworkNames: readonly string[];
  options: ComposeOptions;
}): Promise<WeeklyWriteResult> {
  const slice = sliceWeekly(args.ready, args.bqNetworkNames);
  if (!slice) {
    return emptyWriteResult();
  }

  const systemPrompt = loadPrompt("weekly-breakdown");
  const userMessage = buildWeeklyUserMessage({
    ready: args.ready,
    bqNetworkNames: args.bqNetworkNames,
    slice,
  });

  const resp = await getAnthropicClient().messages.create({
    model: pickModel(args.options.modelHint ?? "sonnet"),
    max_tokens: 1024,
    system: [
      {
        type: "text",
        text: systemPrompt,
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: [
      {
        name: WEEKLY_TOOL_NAME,
        description:
          "Write the weekly breakdown for the requested channel as 2 to 4 bullets plus a Bottom line.",
        input_schema: WEEKLY_TOOL_INPUT_SCHEMA,
        cache_control: { type: "ephemeral" },
      },
    ],
    tool_choice: { type: "tool", name: WEEKLY_TOOL_NAME },
    messages: [{ role: "user", content: userMessage }],
  });

  const toolUse = resp.content.find(
    (b) => b.type === "tool_use" && b.name === WEEKLY_TOOL_NAME,
  );
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("writeWeeklyBreakdown: Sonnet returned no tool_use block");
  }

  const built = buildBlockFromRaw(toolUse.input as RawBlockInput);
  if (!built) {
    return emptyWriteResult({
      promptTokensIn: resp.usage?.input_tokens ?? 0,
      promptTokensOut: resp.usage?.output_tokens ?? 0,
    });
  }

  return {
    blocks: [built.block],
    blockCitations: [built.citations],
    diagnostics: {
      unclosedHighlightTags: built.unclosedTags,
      promptTokensIn: resp.usage?.input_tokens ?? 0,
      promptTokensOut: resp.usage?.output_tokens ?? 0,
    },
  };
}

// ── Writer: campaign-breakdown ─────────────────────────────────────────

export type CampaignWriteResult = WeeklyWriteResult;

/** Color assignment for one campaign row inside a family. The template
 *  pre-picks these from |spendDelta|; the writer is instructed to wrap
 *  any bullet that references the row in the matching color markup. */
export type CampaignCallout = {
  campaignId: string;
  campaignName: string;
  family: string;
  spendDelta: number;
  color: Extract<CalloutColor, "pink" | "orange" | "blue">;
};

export async function writeCampaignBreakdown(args: {
  ready: ReadyData;
  bqNetworkNames: readonly string[];
  options: ComposeOptions;
  /** Optional structured action items the prose-writer surfaces as
   *  per-block actionItem strings. Empty when the user pasted no
   *  notes; the writer emits no action callouts in that case. */
  actionItems?: ActionItem[];
  /** Optional pre-picked color assignments (top 3 rows per family by
   *  |spendDelta|). When supplied, the writer wraps bullet phrases
   *  referencing those rows in matching color markup so the renderer
   *  can paint the bullet to match the row arrow. */
  callouts?: CampaignCallout[];
  /** Platform scope. When set, campaigns whose classifier-derived
   *  platform does not match are dropped from the writer's view, and
   *  the user message gets a "Platform scope: X" header so the
   *  writer never refers to "the iOS campaign" inside an Android
   *  chapter. */
  platformScope?: { platform: "android" | "ios" | "web"; label: string };
}): Promise<CampaignWriteResult> {
  const groups = groupCampaignsByFamily(
    args.ready,
    args.bqNetworkNames,
    args.platformScope?.platform,
  );
  if (groups.length === 0) {
    return emptyWriteResult();
  }

  const campaignIds = new Set<string>();
  for (const g of groups) for (const r of g.rows) campaignIds.add(r.campaign_id);

  const systemPrompt = loadPrompt("campaign-breakdown");
  const userMessage = buildCampaignUserMessage({
    ready: args.ready,
    bqNetworkNames: args.bqNetworkNames,
    groups,
    actionItems: args.actionItems ?? [],
    callouts: args.callouts ?? [],
    platformScope: args.platformScope,
    findings: findingsForCampaigns(
      args.ready,
      args.bqNetworkNames,
      campaignIds,
    ),
  });

  const resp = await getAnthropicClient().messages.create({
    model: pickModel(args.options.modelHint ?? "sonnet"),
    max_tokens: 2048,
    system: [
      {
        type: "text",
        text: systemPrompt,
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: [
      {
        name: CAMPAIGN_TOOL_NAME,
        description:
          "Write one block per campaign family. Each block has a heading, 2 to 4 bullets, a Bottom line, and an optional action item.",
        input_schema: CAMPAIGN_TOOL_INPUT_SCHEMA,
        cache_control: { type: "ephemeral" },
      },
    ],
    tool_choice: { type: "tool", name: CAMPAIGN_TOOL_NAME },
    messages: [{ role: "user", content: userMessage }],
  });

  const toolUse = resp.content.find(
    (b) => b.type === "tool_use" && b.name === CAMPAIGN_TOOL_NAME,
  );
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error(
      "writeCampaignBreakdown: Sonnet returned no tool_use block",
    );
  }
  const input = toolUse.input as { blocks?: RawBlockInput[] };
  if (!Array.isArray(input?.blocks)) {
    throw new Error(
      "writeCampaignBreakdown: tool_use input missing 'blocks' array",
    );
  }

  const blocks: ProseBlock[] = [];
  const blockCitations: ProseCitation[][] = [];
  let unclosedTotal = 0;

  for (const raw of input.blocks) {
    const built = buildBlockFromRaw(raw);
    if (!built) continue;
    blocks.push(built.block);
    blockCitations.push(built.citations);
    unclosedTotal += built.unclosedTags;
  }

  return {
    blocks,
    blockCitations,
    diagnostics: {
      unclosedHighlightTags: unclosedTotal,
      promptTokensIn: resp.usage?.input_tokens ?? 0,
      promptTokensOut: resp.usage?.output_tokens ?? 0,
    },
  };
}

// ── Writer: platform-overall ──────────────────────────────────────────

export type PlatformOverallWriteResult = WeeklyWriteResult;

export async function writePlatformOverall(args: {
  ready: ReadyData;
  /** All BQ network rows the platform should describe, sorted by spend
   *  descending. */
  networks: BQNetworkRow[];
  options: ComposeOptions;
  /** Optional freshness summary the writer surfaces as channel-scoped
   *  caveats. */
  freshness?: FreshnessSummary;
}): Promise<PlatformOverallWriteResult> {
  if (args.networks.length === 0) {
    return emptyWriteResult();
  }

  const systemPrompt = loadPrompt("platform-overall");
  const userMessage = buildPlatformOverallUserMessage({
    ready: args.ready,
    networks: args.networks,
    freshness: args.freshness,
    findings: findingsForNetworks(
      args.ready,
      args.networks.map((n) => n.network),
    ),
  });

  const resp = await getAnthropicClient().messages.create({
    model: pickModel(args.options.modelHint ?? "sonnet"),
    max_tokens: 2048,
    system: [
      {
        type: "text",
        text: systemPrompt,
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: [
      {
        name: PLATFORM_OVERALL_TOOL_NAME,
        description:
          "Write one block per channel that ran spend on this platform. Each block has a heading (channel label), 2 to 4 bullets, and a Bottom line.",
        input_schema: PLATFORM_OVERALL_TOOL_INPUT_SCHEMA,
        cache_control: { type: "ephemeral" },
      },
    ],
    tool_choice: { type: "tool", name: PLATFORM_OVERALL_TOOL_NAME },
    messages: [{ role: "user", content: userMessage }],
  });

  const toolUse = resp.content.find(
    (b) => b.type === "tool_use" && b.name === PLATFORM_OVERALL_TOOL_NAME,
  );
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("writePlatformOverall: Sonnet returned no tool_use block");
  }
  const input = toolUse.input as { blocks?: RawBlockInput[] };
  if (!Array.isArray(input?.blocks)) {
    throw new Error("writePlatformOverall: tool_use missing 'blocks' array");
  }

  const blocks: ProseBlock[] = [];
  const blockCitations: ProseCitation[][] = [];
  let unclosedTotal = 0;
  for (const raw of input.blocks) {
    const built = buildBlockFromRaw(raw);
    if (!built) continue;
    blocks.push(built.block);
    blockCitations.push(built.citations);
    unclosedTotal += built.unclosedTags;
  }

  return {
    blocks,
    blockCitations,
    diagnostics: {
      unclosedHighlightTags: unclosedTotal,
      promptTokensIn: resp.usage?.input_tokens ?? 0,
      promptTokensOut: resp.usage?.output_tokens ?? 0,
    },
  };
}

// ── Writer: closer (Phase 2) ──────────────────────────────────────────

const CLOSER_TOOL_NAME = "write_closer";

const CLOSER_TOOL_INPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    title: { type: "string" as const },
    subtitle: { type: "string" as const },
    contactLine: { type: "string" as const },
  },
  required: ["title"],
};

export type CloserContent = {
  title: string;
  subtitle?: string;
  contactLine?: string;
};

export async function writeCloser(args: {
  options: ComposeOptions;
  contactDisplayName?: string;
  contactEmail?: string;
}): Promise<CloserContent> {
  // Haiku is enough for the closer (polite + on-brand, no analysis).
  const systemPrompt = loadPrompt("closer");
  const userParts: string[] = [];
  if (args.contactDisplayName) {
    userParts.push(`contactDisplayName: ${args.contactDisplayName}`);
  }
  if (args.contactEmail) {
    userParts.push(`contactEmail: ${args.contactEmail}`);
  }
  if (userParts.length === 0) {
    userParts.push("(no contact info; emit a generic closer)");
  }
  userParts.push("", "Call write_closer.");

  const resp = await getAnthropicClient().messages.create({
    model: pickModel(args.options.modelHint ?? "haiku"),
    max_tokens: 256,
    system: [
      {
        type: "text",
        text: systemPrompt,
        cache_control: { type: "ephemeral" },
      },
    ],
    tools: [
      {
        name: CLOSER_TOOL_NAME,
        description: "Write the deck closer (title + subtitle + contact).",
        input_schema: CLOSER_TOOL_INPUT_SCHEMA,
        cache_control: { type: "ephemeral" },
      },
    ],
    tool_choice: { type: "tool", name: CLOSER_TOOL_NAME },
    messages: [{ role: "user", content: userParts.join("\n") }],
  });

  const toolUse = resp.content.find(
    (b) => b.type === "tool_use" && b.name === CLOSER_TOOL_NAME,
  );
  if (!toolUse || toolUse.type !== "tool_use") {
    return defaultCloser(args);
  }
  const input = toolUse.input as {
    title?: unknown;
    subtitle?: unknown;
    contactLine?: unknown;
  };
  const title = typeof input.title === "string" ? input.title : "Thank you";
  return {
    title: title || "Thank you",
    subtitle: typeof input.subtitle === "string" ? input.subtitle : undefined,
    contactLine:
      typeof input.contactLine === "string" ? input.contactLine : undefined,
  };
}

function defaultCloser(args: {
  contactDisplayName?: string;
  contactEmail?: string;
}): CloserContent {
  const lines: string[] = ["Contact me"];
  if (args.contactDisplayName) lines.push(args.contactDisplayName);
  if (args.contactEmail) lines.push(args.contactEmail);
  return {
    title: "Thank you",
    subtitle: "Follow us",
    contactLine: lines.length > 1 ? lines.join("\n") : undefined,
  };
}

// ── User-message builders ──────────────────────────────────────────────

function buildWeeklyUserMessage(args: {
  ready: ReadyData;
  bqNetworkNames: readonly string[];
  slice: { current: BQNetworkRow; history: WeeklyHistoryRow[] };
}): string {
  const parts: string[] = [
    `Client: ${args.ready.clientLabel}`,
    `Period: ${args.ready.period.isoStart} to ${args.ready.period.isoEnd}`,
    `Channel network label: ${args.slice.current.network}`,
    "",
    "Current period network row:",
    JSON.stringify(args.slice.current, null, 2),
    "",
    args.slice.history.length > 0
      ? `Trailing ${args.slice.history.length} weeks (oldest first):`
      : "Trailing history: none available.",
  ];
  if (args.slice.history.length > 0) {
    parts.push(
      JSON.stringify(
        args.slice.history.map((h) => ({
          weekLabel: h.weekLabel,
          weekIsoStart: h.weekIsoStart,
          weekIsoEnd: h.weekIsoEnd,
          metrics: h.metrics,
        })),
        null,
        2,
      ),
    );
  }
  parts.push(
    "",
    `Provenance queryIds available for citation: ${args.ready.provenance.queryIds.join(", ")}`,
  );
  const findingsBlock = renderFindingsBlock(
    findingsForNetworks(args.ready, args.bqNetworkNames),
  );
  if (findingsBlock) parts.push(findingsBlock);
  parts.push(
    "",
    "Write the weekly breakdown. Call write_weekly_breakdown with 2 to 4 bullets plus a bottomLine.",
  );
  return parts.filter((s) => s.length > 0).join("\n");
}

function buildPlatformOverallUserMessage(args: {
  ready: ReadyData;
  networks: BQNetworkRow[];
  freshness?: FreshnessSummary;
  findings: AnalystFinding[];
}): string {
  const parts: string[] = [
    `Client: ${args.ready.clientLabel}`,
    `Period: ${args.ready.period.isoStart} to ${args.ready.period.isoEnd}`,
    "",
    "Networks active this period (sorted by spend descending):",
    JSON.stringify(args.networks, null, 2),
    "",
    `Provenance queryIds available for citation: ${args.ready.provenance.queryIds.join(", ")}`,
  ];
  if (args.freshness?.hasIssues) {
    parts.push(
      "",
      "<freshness>",
      freshnessAsContextString(args.freshness),
      "</freshness>",
    );
  }
  const findingsBlock = renderFindingsBlock(args.findings);
  if (findingsBlock) parts.push(findingsBlock);
  parts.push(
    "",
    "Write one block per channel that ran spend (2 to 4 bullets + bottomLine each). Optionally lead with a synthesis block (empty heading) when the cross-channel pattern is clear. Call write_platform_overall.",
  );
  return parts.join("\n");
}

function buildCampaignUserMessage(args: {
  ready: ReadyData;
  bqNetworkNames: readonly string[];
  groups: { family: string; totalSpend: number; rows: ReadyData["campaigns"] }[];
  actionItems: ActionItem[];
  callouts: CampaignCallout[];
  platformScope?: { platform: "android" | "ios" | "web"; label: string };
  findings: AnalystFinding[];
}): string {
  const parts: string[] = [
    `Client: ${args.ready.clientLabel}`,
    `Period: ${args.ready.period.isoStart} to ${args.ready.period.isoEnd}`,
  ];
  if (args.platformScope) {
    parts.push(
      `Platform scope: ${args.platformScope.label}. All campaigns below ran on this platform; do not refer to campaigns on other platforms.`,
    );
  }
  parts.push(
    "",
    "Campaign families (sorted by spend descending):",
    JSON.stringify(
      args.groups.map((g) => ({
        family: g.family,
        totalSpend: g.totalSpend,
        rows: g.rows.map((r) => ({
          campaign_id: r.campaign_id,
          campaign_name: r.campaign_name,
          network: r.network,
          family: r.family,
          geo: r.geo,
          campaignType: r.campaignType,
          platform: r.platform,
          spend: r.spend,
          installs: r.installs,
          cpi: r.cpi,
          spendDelta: r.spendDelta,
        })),
      })),
      null,
      2,
    ),
    "",
    `Provenance queryIds available for citation: ${args.ready.provenance.queryIds.join(", ")}`,
  );
  if (args.callouts.length > 0) {
    parts.push(
      "",
      "Callout assignments. Each row below has been pre-flagged by spend delta magnitude and will render with a colored arrow on its table row. When a bullet references one of these rows, wrap the reference in the matching color markup ({{pink}}...{{/pink}}, {{orange}}...{{/orange}}, {{blue}}...{{/blue}}) so the highlight phrase pairs visually with the arrow. Not every bullet must reference a callout row; only the bullets that interpret a flagged campaign.",
      "",
      ...args.callouts.map(
        (c) =>
          `- {color: ${c.color}} campaign_id=${c.campaignId} (${c.campaignName}, spendDelta=${formatDeltaPct(c.spendDelta)}, family=${c.family})`,
      ),
    );
  }
  if (args.actionItems.length > 0) {
    parts.push(
      "",
      "<actions>",
      actionItemsAsContextString(args.actionItems),
      "</actions>",
      "When a family has matching action items, set the block's `actionItem` field to a single short sentence summarising them (do not weave them into the bullets; the renderer paints actionItem as a `<> AI:` callout under the bullets).",
    );
  }
  const findingsBlock = renderFindingsBlock(args.findings);
  if (findingsBlock) parts.push(findingsBlock);
  parts.push(
    "",
    "Write one block per family (2 to 4 bullets + bottomLine each, heading = family label). Call write_campaign_breakdown.",
  );
  return parts.join("\n");
}

function formatDeltaPct(d: number): string {
  if (!Number.isFinite(d)) return "n/a";
  const pct = d * 100;
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}

function emptyWriteResult(usage?: {
  promptTokensIn?: number;
  promptTokensOut?: number;
}): WeeklyWriteResult {
  return {
    blocks: [],
    blockCitations: [],
    diagnostics: {
      unclosedHighlightTags: 0,
      promptTokensIn: usage?.promptTokensIn ?? 0,
      promptTokensOut: usage?.promptTokensOut ?? 0,
    },
  };
}
