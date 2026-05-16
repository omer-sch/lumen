import "server-only";

import { findClient } from "@/lib/mock/clients";
import type {
  CampaignCommentary,
  ChannelCampaignSection,
  ChannelWeeklySection,
  PlatformOverallSection,
  Report,
  ReportSection,
  WeeklyBullet,
} from "@/lib/reports/types";

import type { Bullet, HermesSnapshot, Intent, SlideTarget } from "./state";

// Assembler. Takes the structural data (snapshot) plus the Quill
// bullets, returns a Report ready to insert into the reports table.
//
// Section bullets / commentary come straight from Quill, grouped by
// slide_target. Sections with no Quill bullets render with empty
// bullet lists, which is the same renderer fallback the manual flow
// uses for sparse sections. The Report shape matches what
// src/lib/reports/generate.ts produces for the manual path so
// ReportDocument hits exactly the same render code.

function groupBulletsBySlide(bullets: Bullet[]): Record<SlideTarget, Bullet[]> {
  const groups: Record<SlideTarget, Bullet[]> = {
    platform_overall: [],
    channel_weekly: [],
    campaign_breakdown: [],
    closing: [],
  };
  for (const b of bullets) {
    groups[b.slide_target].push(b);
  }
  return groups;
}

export function bulletToWeekly(b: Bullet, isFirst: boolean): WeeklyBullet {
  // Headline tone on the first bullet only, and only when the bullet
  // carries a clear directional signal (action_item set OR a large
  // absolute delta). Everything else stays neutral so the renderer
  // does not over-shout. Lior can promote a bullet to headline by
  // editing it in /reports.
  const big = typeof b.delta_value === "number" && Math.abs(b.delta_value) >= 20;
  const directional = b.action_item != null;
  if (isFirst && (big || directional)) {
    const tone: WeeklyBullet["tone"] =
      typeof b.delta_value === "number" && b.delta_value < 0
        ? "headline-good"
        : "headline-bad";
    return { text: b.claim, tone };
  }
  return { text: b.claim };
}

export function bulletToCommentary(b: Bullet, index: number): CampaignCommentary {
  return {
    groupLabel: `Hermes note ${index + 1}`,
    observation: b.claim,
    actionItem: b.action_item ?? "Holding for now; flagging for review.",
  };
}

type AssembleArgs = {
  intent: Intent;
  snapshot: HermesSnapshot;
  bullets: Bullet[];
  runId: string;
  ownerUserId: string;
};

export function assembleHermesReport(args: AssembleArgs): Report {
  const { intent, snapshot, bullets, runId, ownerUserId } = args;
  const grouped = groupBulletsBySlide(bullets);
  const client = findClient(intent.client);

  const sections: ReportSection[] = [];

  if (snapshot.platformOverall) {
    const platformBullets = grouped.platform_overall;
    const section: PlatformOverallSection = {
      id: "platform_overall",
      platform: "android",
      title: "Android | Overall | Weekly Breakdown",
      summary: snapshot.platformOverall,
      bullets: platformBullets.map((b, i) => bulletToWeekly(b, i === 0)),
    };
    sections.push(section);
  }

  if (snapshot.channelWeekly) {
    const weeklyBullets = grouped.channel_weekly;
    const section: ChannelWeeklySection = {
      id: "channel_weekly",
      platform: "android",
      channel: "meta",
      title: "Android | Meta | Weekly Breakdown",
      currentWeek: snapshot.channelWeekly.currentWeek,
      history: snapshot.channelWeekly.history,
      bullets: weeklyBullets.map((b, i) => bulletToWeekly(b, i === 0)),
    };
    sections.push(section);
  }

  if (snapshot.channelCampaign) {
    const campaignBullets = grouped.campaign_breakdown;
    const section: ChannelCampaignSection = {
      id: "channel_campaign",
      platform: "android",
      channel: "meta",
      title: "Android | Meta | Campaign Breakdown",
      rows: snapshot.channelCampaign.rows,
      commentary: campaignBullets.length
        ? campaignBullets.map((b, i) => bulletToCommentary(b, i))
        : [],
    };
    sections.push(section);
  }

  const now = Date.now();
  const draftTitle = `${snapshot.clientLabel} weekly review · ${snapshot.period.label}`;

  const report: Report = {
    id: `rpt_${runId}`,
    userId: ownerUserId,
    client: intent.client,
    clientLabel: snapshot.clientLabel || client.name,
    title: draftTitle,
    prompt: `Hermes draft from ${snapshot.clientLabel} email request`,
    period: snapshot.period.label,
    filterRange: snapshot.period.filterRange,
    createdAt: now,
    updatedAt: now,
    authoredBy: "hermes",
    source: "hermes",
    agentRunId: runId,
    sections,
  };

  return report;
}
