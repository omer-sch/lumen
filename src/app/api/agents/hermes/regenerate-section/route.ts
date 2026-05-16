import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireAgentAuth } from "@/lib/agents/_scaffold/auth";
import { getRun } from "@/lib/agents/_scaffold/run";
import {
  bulletToCommentary,
  bulletToWeekly,
} from "@/lib/agents/hermes/assemble";
import {
  buildQuillRegenerateGraph,
  filterBulletsToTarget,
  type RegenerateTarget,
} from "@/lib/agents/hermes/regenerate";
import { type Bullet, type Finding, type Intent } from "@/lib/agents/hermes/state";
import {
  getReportForUser,
  upsertReport,
} from "@/lib/reports/server-store";
import type {
  ChannelCampaignSection,
  ChannelWeeklySection,
  PlatformOverallSection,
  Report,
  ReportSection,
} from "@/lib/reports/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const RegenerateRequestSchema = z.object({
  report_id: z.string().min(1).max(128),
  slide_target: z.enum([
    "platform_overall",
    "channel_weekly",
    "campaign_breakdown",
  ]),
  original_run_id: z.string().min(1).max(128),
});

// Maps a Quill slide_target onto the Report.sections id it lives in.
// platform_overall / channel_weekly are 1:1; campaign_breakdown rows
// land on channel_campaign (the section id is historical, the slide
// target is the LLM-side label).
const SECTION_ID_FOR: Record<RegenerateTarget, ReportSection["id"]> = {
  platform_overall: "platform_overall",
  channel_weekly: "channel_weekly",
  campaign_breakdown: "channel_campaign",
};

function patchSection(
  section: ReportSection,
  target: RegenerateTarget,
  bullets: Bullet[],
): ReportSection {
  if (target === "campaign_breakdown" && section.id === "channel_campaign") {
    const next: ChannelCampaignSection = {
      ...section,
      commentary: bullets.length
        ? bullets.map((b, i) => bulletToCommentary(b, i))
        : section.commentary,
    };
    return next;
  }
  if (target === "platform_overall" && section.id === "platform_overall") {
    const next: PlatformOverallSection = {
      ...section,
      bullets: bullets.map((b, i) => bulletToWeekly(b, i === 0)),
    };
    return next;
  }
  if (target === "channel_weekly" && section.id === "channel_weekly") {
    const next: ChannelWeeklySection = {
      ...section,
      bullets: bullets.map((b, i) => bulletToWeekly(b, i === 0)),
    };
    return next;
  }
  return section;
}

export async function POST(req: NextRequest) {
  // Tighter limit than the full generate route: 30 / 5 min per (user,
  // agent) covers Lior tweaking a couple sections per report without
  // letting a stuck client thrash Sonnet.
  const authResult = await requireAgentAuth("hermes.regenerate", {
    maxPerWindow: 30,
    windowMs: 5 * 60 * 1000,
  });
  if (!authResult.ok) {
    const headers: Record<string, string> = {};
    if (authResult.status === 429) {
      headers["Retry-After"] = String(authResult.retryAfterSeconds);
    }
    return NextResponse.json(
      { error: authResult.error },
      { status: authResult.status, headers },
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = RegenerateRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid body", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { report_id, slide_target, original_run_id } = parsed.data;
  const userId = authResult.userId;
  const start = Date.now();

  // Ownership check on the report. getReportForUser returns null both
  // for "not found" and "found but forbidden" so the response shape
  // does not leak existence to a non-owner.
  const report = await getReportForUser(report_id, userId);
  if (!report) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (report.source !== "hermes") {
    return NextResponse.json(
      { error: "Can only regenerate Hermes-drafted reports" },
      { status: 400 },
    );
  }
  if (!report.agentRunId || report.agentRunId !== original_run_id) {
    return NextResponse.json(
      { error: "Report does not match the supplied original_run_id" },
      { status: 400 },
    );
  }

  // Pull the original run's intent + findings out of agent_runs.output.
  const run = await getRun(original_run_id);
  if (!run || run.agentId !== "hermes" || run.status !== "completed") {
    return NextResponse.json(
      { error: "Original Hermes run unavailable" },
      { status: 409 },
    );
  }
  const runOutput = (run.output ?? {}) as Record<string, unknown>;
  const intent = (runOutput.intent ?? null) as Intent | null;
  const findings =
    (runOutput.findings as Finding[] | undefined) ?? ([] as Finding[]);
  if (!intent || findings.length === 0) {
    return NextResponse.json(
      {
        error:
          "Original run is missing intent or findings; cannot regenerate.",
      },
      { status: 409 },
    );
  }

  // Fire the regenerate sub-graph (single Quill node). Quill returns
  // bullets for every slide_target; filter back to the requested one.
  let nextBullets: Bullet[];
  try {
    const graph = buildQuillRegenerateGraph();
    const finalState = await graph.invoke({
      email_text: "",
      run_id: original_run_id,
      user_id: userId,
      intent,
      findings,
      context: { knowledge: [], history: [], comms: [] },
      snapshot: null,
      bullets: [],
      deck: { pptx_path: null, slides: [], report_id: null },
      approval: {
        approved: false,
        approved_by: null,
        approved_at: null,
        edits: [],
      },
      history: [],
    });
    nextBullets = filterBulletsToTarget(
      finalState.bullets,
      slide_target as RegenerateTarget,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error({
      event: "hermes.regenerate.failed",
      report_id,
      slide_target,
      original_run_id,
      error: message,
    });
    return NextResponse.json(
      { error: "Regenerate failed", detail: message },
      { status: 500 },
    );
  }

  // Patch the matching section in place, append the audit entry, save.
  const targetSectionId = SECTION_ID_FOR[slide_target as RegenerateTarget];
  const patchedSections = report.sections.map((s) =>
    s.id === targetSectionId
      ? patchSection(s, slide_target as RegenerateTarget, nextBullets)
      : s,
  );
  const updated: Report = {
    ...report,
    updatedAt: Date.now(),
    sections: patchedSections,
    audit: [
      ...(report.audit ?? []),
      {
        kind: "regenerate_section",
        slide_target,
        at: new Date().toISOString(),
        by: userId,
      },
    ],
  };

  try {
    await upsertReport(updated, userId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("forbidden")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    console.error({
      event: "hermes.regenerate.save_failed",
      report_id,
      error: message,
    });
    return NextResponse.json({ error: "Save failed" }, { status: 500 });
  }

  console.info({
    event: "hermes.regenerate",
    user_id: userId,
    report_id,
    slide_target,
    bullet_count: nextBullets.length,
    latency_ms: Date.now() - start,
  });

  return NextResponse.json({
    report_id,
    slide_target,
    bullet_count: nextBullets.length,
    latency_ms: Date.now() - start,
  });
}
