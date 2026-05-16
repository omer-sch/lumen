import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getReadyData } from "@/lib/analyst";
import type { Intent } from "@/lib/analyst/types";
import { requireUser } from "@/lib/auth/require-user";
import { rateLimit } from "@/lib/rate-limit";
import {
  validateCitations,
} from "@/lib/smart-reports/citation-validator";
import { parseActionItems } from "@/lib/smart-reports/action-items";
import { summarizeFreshness } from "@/lib/smart-reports/freshness";
import {
  writeCampaignBreakdown,
  writePlatformOverall,
  writeWeeklyBreakdown,
  type CampaignCallout,
} from "@/lib/smart-reports/prose-writer";
import type { ProseBlock, ProseCitation } from "@/lib/smart-reports/types";
import {
  getReportForUser,
  upsertReport,
} from "@/lib/reports/server-store";
import type {
  CalloutColor,
  ChannelCampaignSection,
  ChannelWeeklySection,
  PlatformOverallSection,
  Report,
  ReportChapter,
  ReportSection,
} from "@/lib/reports/types";

export const runtime = "nodejs";
export const maxDuration = 60;

// Per-section regenerate for Smart Reports. Re-runs ONE writer (the
// one matching the section's id + scope) against the same ReadyData,
// validates citations, swaps the prose blocks in place, leaves the
// structural snapshot table untouched. Works for both manual and
// Hermes-drafted reports because both stamp `regenerationContext`
// on the Report when generated.

const RegenerateRequestSchema = z.object({
  sectionId: z.string().min(1).max(128),
});

const BQ_NETWORK_NAMES_FOR_CHANNEL: Record<
  Intent["channels"][number],
  readonly string[]
> = {
  meta: ["Meta", "Facebook"],
  google: ["Google", "Google Ads", "Google Ads ACI"],
  tiktok: ["TikTok"],
  apple_search_ads: ["Apple", "Apple Search Ads"],
  applovin: ["AppLovin"],
};

const REPORT_CHANNEL_TO_INTENT: Record<
  "meta" | "google" | "tiktok" | "asa" | "search",
  Intent["channels"][number]
> = {
  meta: "meta",
  google: "google",
  tiktok: "tiktok",
  asa: "apple_search_ads",
  search: "applovin",
};

const CALLOUT_COLORS: readonly Extract<
  CalloutColor,
  "pink" | "orange" | "blue"
>[] = ["pink", "orange", "blue"] as const;

/** Stable identifier for a section inside a report. Mirrors the keys
 *  the client emits when wiring per-section action buttons. */
function sectionKey(s: ReportSection): string {
  if (s.id === "platform_overall") return `${s.platform}--platform_overall`;
  if (s.id === "channel_weekly") {
    return `${s.platform}-${s.channel}--channel_weekly`;
  }
  if (s.id === "channel_campaign") {
    return `${s.platform}-${s.channel}--channel_campaign`;
  }
  return `legacy--${s.id}`;
}

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  // Per-user limit: 30 in 5 min. Tighter than the generate route's
  // default 120 because regenerating spends Sonnet tokens per click.
  const authResult = await requireUser({
    scope: "reports.regenerate-section",
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

  const { id: reportId } = await ctx.params;
  if (!reportId) {
    return NextResponse.json({ error: "Missing report id" }, { status: 400 });
  }

  // Per-report cap. 10 / hour guards against an automated loop on a
  // single report draining Sonnet budget. Keyed by report id so a
  // single user cannot evade it by hitting different reports.
  const perReport = rateLimit(
    `reports.regenerate-section:report:${reportId}`,
    10,
    60 * 60 * 1000,
  );
  if (!perReport.allowed) {
    return NextResponse.json(
      {
        error: `This report has hit the regenerate cap (10/hour). Retry in ${perReport.retryAfterSeconds}s.`,
      },
      {
        status: 429,
        headers: { "Retry-After": String(perReport.retryAfterSeconds) },
      },
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
  const { sectionId } = parsed.data;
  const userId = authResult.userId;
  const start = Date.now();

  const report = await getReportForUser(reportId, userId);
  if (!report) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!report.regenerationContext) {
    return NextResponse.json(
      {
        error:
          "Report is missing regeneration context. Regenerate the whole deck to refresh.",
      },
      { status: 409 },
    );
  }

  const section = report.sections.find((s) => sectionKey(s) === sectionId);
  if (!section) {
    return NextResponse.json({ error: "Section not found" }, { status: 404 });
  }
  if (
    section.id !== "platform_overall" &&
    section.id !== "channel_weekly" &&
    section.id !== "channel_campaign"
  ) {
    return NextResponse.json(
      { error: "Section type not regeneratable" },
      { status: 400 },
    );
  }

  // Rebuild the intent from the regeneration context.
  const ctxData = report.regenerationContext;
  const intent: Intent = {
    client: report.client,
    platforms: ctxData.platforms,
    channels: ctxData.channels,
    period: {
      label: report.period,
      iso_start: ctxData.periodIsoStart,
      iso_end: ctxData.periodIsoEnd,
    },
    focus: null,
    confidence: 1,
    doubts: [],
  };

  let ready;
  try {
    ready = await getReadyData(intent);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `ReadyData fetch failed: ${message}` },
      { status: 502 },
    );
  }

  // Dispatch to the matching writer.
  let proseBlocks: ProseBlock[];
  let citations: ProseCitation[][];
  try {
    if (section.id === "platform_overall") {
      const result = await writePlatformOverall({
        ready,
        networks: ready.networks
          .filter((n) => n.spend > 0)
          .slice()
          .sort((a, b) => b.spend - a.spend),
        options: { template: "weekly-review-globalcomix" },
        freshness: summarizeFreshness(ready),
      });
      proseBlocks = result.blocks;
      citations = result.blockCitations;
    } else if (section.id === "channel_weekly") {
      const intentChannel = REPORT_CHANNEL_TO_INTENT[section.channel];
      const bqNames = BQ_NETWORK_NAMES_FOR_CHANNEL[intentChannel] ?? [];
      const result = await writeWeeklyBreakdown({
        ready,
        bqNetworkNames: bqNames,
        options: { template: "weekly-review-globalcomix" },
      });
      proseBlocks = result.blocks;
      citations = result.blockCitations;
    } else {
      const intentChannel = REPORT_CHANNEL_TO_INTENT[section.channel];
      const bqNames = BQ_NETWORK_NAMES_FOR_CHANNEL[intentChannel] ?? [];
      const channelCampaigns = ready.campaigns.filter((c) =>
        bqNames.includes(c.network),
      );
      const callouts = pickCalloutsForChannel(channelCampaigns);
      const result = await writeCampaignBreakdown({
        ready,
        bqNetworkNames: bqNames,
        options: { template: "weekly-review-globalcomix" },
        // Replay the original action notes so the regenerated block
        // surfaces the same `<> AI:` callouts when a family matches.
        actionItems: parseActionItems(
          ctxData.actionNotes ?? undefined,
          ready,
        ),
        callouts,
      });
      proseBlocks = result.blocks;
      citations = result.blockCitations;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Writer failed: ${message}` },
      { status: 500 },
    );
  }

  const verdict = validateCitations(proseBlocks, ready, citations);
  if (!verdict.ok) {
    return NextResponse.json(
      { error: `Citation validation failed: ${verdict.error}` },
      { status: 500 },
    );
  }

  // Patch the section's prose in place. The structural snapshot
  // table is untouched.
  const patchedSection = patchSectionProse(section, proseBlocks);
  const patchedSections = report.sections.map((s) =>
    sectionKey(s) === sectionId ? patchedSection : s,
  );
  const patchedChapters = report.chapters
    ? report.chapters.map<ReportChapter>((ch) => ({
        ...ch,
        sections: ch.sections.map((s) =>
          sectionKey(s) === sectionId ? patchedSection : s,
        ),
      }))
    : undefined;

  const updated: Report = {
    ...report,
    updatedAt: Date.now(),
    sections: patchedSections,
    chapters: patchedChapters,
    audit: [
      ...(report.audit ?? []),
      {
        kind: "regenerate_section",
        slide_target: sectionId,
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
      event: "reports.regenerate-section.save_failed",
      reportId,
      sectionId,
      error: message,
    });
    return NextResponse.json({ error: "Save failed" }, { status: 500 });
  }

  console.info({
    event: "reports.regenerate-section",
    user_id: userId,
    report_id: reportId,
    section_id: sectionId,
    blocks: proseBlocks.length,
    latency_ms: Date.now() - start,
  });

  return NextResponse.json({
    section: patchedSection,
    blocks: proseBlocks.length,
    latency_ms: Date.now() - start,
  });
}

function patchSectionProse(
  section:
    | PlatformOverallSection
    | ChannelWeeklySection
    | ChannelCampaignSection,
  prose: ProseBlock[],
): PlatformOverallSection | ChannelWeeklySection | ChannelCampaignSection {
  if (section.id === "platform_overall") {
    const next: PlatformOverallSection = { ...section, prose };
    return next;
  }
  if (section.id === "channel_weekly") {
    const next: ChannelWeeklySection = { ...section, prose };
    return next;
  }
  const next: ChannelCampaignSection = { ...section, prose };
  return next;
}

function pickCalloutsForChannel(
  rows: Awaited<ReturnType<typeof getReadyData>>["campaigns"],
): CampaignCallout[] {
  return rows
    .slice()
    .sort(
      (a, b) =>
        Math.abs(b.spendDelta ?? 0) - Math.abs(a.spendDelta ?? 0),
    )
    .slice(0, CALLOUT_COLORS.length)
    .filter((r) => Number.isFinite(r.spendDelta) && (r.spendDelta ?? 0) !== 0)
    .map((r, i) => ({
      campaignId: r.campaign_id,
      campaignName: r.campaign_name,
      family: r.family,
      spendDelta: r.spendDelta ?? 0,
      color: CALLOUT_COLORS[i],
    }));
}
