import "server-only";

import * as fs from "node:fs";
import * as path from "node:path";

import { getAnthropicClient, pickModel } from "@/lib/agents/_scaffold/model";
import type { ReadyData, WeeklyHistoryRow } from "@/lib/analyst/types";
import type { NetworkRow as BQNetworkRow } from "@/types/dashboard";

import { extractCitations } from "./citation-validator";
import {
  countUnclosedTags,
  parseHighlightMarkup,
} from "./highlight-markup";
import type {
  ComposeOptions,
  ProseBlock,
  ProseCitation,
} from "./types";

// Prose-writer. Single Sonnet tool_use call per section. Two flavors
// today (mirroring the two prompt files in prompts/):
//
//   - weekly-breakdown: one short paragraph describing the platform /
//     channel performance for the current period, comparing against
//     trailing weeks when ReadyData.history is populated.
//   - campaign-breakdown: one paragraph per campaign family present in
//     the data, grouping by family.
//
// Each writer returns ProseBlock[] (with highlight markup parsed) and
// the per-block citation list so the orchestrator (index.ts) can run
// the citation validator.
//
// Prompts live as markdown files in ./prompts/ so an analyst (Omer)
// can edit them without touching code. They are read at process
// startup with fs.readFileSync; tests stub the read by mocking this
// module's `loadPrompt` helper.

// ── Prompt loading ─────────────────────────────────────────────────────

const PROMPTS_DIR = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "prompts",
);

function loadPrompt(name: "weekly-breakdown" | "campaign-breakdown"): string {
  const file = path.join(PROMPTS_DIR, `${name}.md`);
  return fs.readFileSync(file, "utf-8");
}

// ── Tool schemas ───────────────────────────────────────────────────────

const WEEKLY_TOOL_NAME = "write_weekly_breakdown";

const WEEKLY_TOOL_INPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    prose: { type: "string" },
  },
  required: ["prose"],
};

const CAMPAIGN_TOOL_NAME = "write_campaign_breakdown";

const CAMPAIGN_TOOL_INPUT_SCHEMA = {
  type: "object" as const,
  properties: {
    blocks: {
      type: "array",
      maxItems: 12,
      items: {
        type: "object",
        properties: {
          heading: { type: "string" },
          prose: { type: "string" },
        },
        required: ["heading", "prose"],
      },
    },
  },
  required: ["blocks"],
};

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
): { family: string; totalSpend: number; rows: ReadyData["campaigns"] }[] {
  const filtered = ready.campaigns.filter((c) =>
    bqNetworkNames.includes(c.network),
  );
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
    return {
      blocks: [],
      blockCitations: [],
      diagnostics: {
        unclosedHighlightTags: 0,
        promptTokensIn: 0,
        promptTokensOut: 0,
      },
    };
  }

  const systemPrompt = loadPrompt("weekly-breakdown");
  const userMessage = buildWeeklyUserMessage({
    ready: args.ready,
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
          "Write the one-paragraph weekly breakdown prose for the requested channel.",
        input_schema: WEEKLY_TOOL_INPUT_SCHEMA,
        cache_control: { type: "ephemeral" },
      },
    ],
    tool_choice: { type: "tool", name: WEEKLY_TOOL_NAME },
    messages: [
      {
        role: "user",
        content: userMessage,
      },
    ],
  });

  const toolUse = resp.content.find(
    (b) => b.type === "tool_use" && b.name === WEEKLY_TOOL_NAME,
  );
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("writeWeeklyBreakdown: Sonnet returned no tool_use block");
  }
  const input = toolUse.input as { prose?: unknown };
  if (typeof input?.prose !== "string") {
    throw new Error(
      "writeWeeklyBreakdown: tool_use input missing 'prose' string",
    );
  }
  const raw = input.prose;

  const unclosed = countUnclosedTags(raw);

  // Strip citations first (they're metadata, not prose), then parse
  // highlight markup over the cleaned text. Order matters because
  // `[cite:...]` tokens don't contain `{{}}`, but isolating them
  // makes the markup parser's regex simpler.
  const { text: stripped, citations } = extractCitations(raw);
  const parsed = parseHighlightMarkup(stripped);

  const block: ProseBlock = {
    text: parsed.text,
    highlights: parsed.tokens,
  };

  return {
    blocks: [block],
    blockCitations: [citations],
    diagnostics: {
      unclosedHighlightTags: unclosed,
      promptTokensIn: resp.usage?.input_tokens ?? 0,
      promptTokensOut: resp.usage?.output_tokens ?? 0,
    },
  };
}

// ── Writer: campaign-breakdown ─────────────────────────────────────────

export type CampaignWriteResult = WeeklyWriteResult;

export async function writeCampaignBreakdown(args: {
  ready: ReadyData;
  bqNetworkNames: readonly string[];
  options: ComposeOptions;
}): Promise<CampaignWriteResult> {
  const groups = groupCampaignsByFamily(args.ready, args.bqNetworkNames);
  if (groups.length === 0) {
    return {
      blocks: [],
      blockCitations: [],
      diagnostics: {
        unclosedHighlightTags: 0,
        promptTokensIn: 0,
        promptTokensOut: 0,
      },
    };
  }

  const systemPrompt = loadPrompt("campaign-breakdown");
  const userMessage = buildCampaignUserMessage({
    ready: args.ready,
    groups,
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
          "Write one prose paragraph per campaign family that has spend this period.",
        input_schema: CAMPAIGN_TOOL_INPUT_SCHEMA,
        cache_control: { type: "ephemeral" },
      },
    ],
    tool_choice: { type: "tool", name: CAMPAIGN_TOOL_NAME },
    messages: [
      {
        role: "user",
        content: userMessage,
      },
    ],
  });

  const toolUse = resp.content.find(
    (b) => b.type === "tool_use" && b.name === CAMPAIGN_TOOL_NAME,
  );
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error(
      "writeCampaignBreakdown: Sonnet returned no tool_use block",
    );
  }
  const input = toolUse.input as {
    blocks?: Array<{ heading?: unknown; prose?: unknown }>;
  };
  if (!Array.isArray(input?.blocks)) {
    throw new Error(
      "writeCampaignBreakdown: tool_use input missing 'blocks' array",
    );
  }

  const blocks: ProseBlock[] = [];
  const blockCitations: ProseCitation[][] = [];
  let unclosedTotal = 0;

  for (const raw of input.blocks) {
    const heading = typeof raw.heading === "string" ? raw.heading : "";
    const proseText = typeof raw.prose === "string" ? raw.prose : "";
    if (proseText.length === 0) continue;
    unclosedTotal += countUnclosedTags(proseText);
    const { text: stripped, citations } = extractCitations(proseText);
    const parsed = parseHighlightMarkup(stripped);
    blocks.push({
      heading,
      text: parsed.text,
      highlights: parsed.tokens,
    });
    blockCitations.push(citations);
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

// ── User-message builders ──────────────────────────────────────────────

function buildWeeklyUserMessage(args: {
  ready: ReadyData;
  slice: { current: BQNetworkRow; history: WeeklyHistoryRow[] };
}): string {
  return [
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
    args.slice.history.length > 0
      ? JSON.stringify(
          args.slice.history.map((h) => ({
            weekLabel: h.weekLabel,
            weekIsoStart: h.weekIsoStart,
            weekIsoEnd: h.weekIsoEnd,
            metrics: h.metrics,
          })),
          null,
          2,
        )
      : "",
    "",
    `Provenance queryIds available for citation: ${args.ready.provenance.queryIds.join(", ")}`,
    "",
    "Write the one-paragraph weekly breakdown. Call write_weekly_breakdown.",
  ]
    .filter((s) => s.length > 0)
    .join("\n");
}

function buildCampaignUserMessage(args: {
  ready: ReadyData;
  groups: { family: string; totalSpend: number; rows: ReadyData["campaigns"] }[];
}): string {
  return [
    `Client: ${args.ready.clientLabel}`,
    `Period: ${args.ready.period.isoStart} to ${args.ready.period.isoEnd}`,
    "",
    "Campaign families (sorted by spend descending):",
    JSON.stringify(
      args.groups.map((g) => ({
        family: g.family,
        totalSpend: g.totalSpend,
        rows: g.rows.map((r) => ({
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
    "",
    "Write one prose block per family. Call write_campaign_breakdown.",
  ].join("\n");
}
