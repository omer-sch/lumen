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

import { reportChannelFromIntent } from "./snapshot";
import type { Bullet, HermesSnapshot, Intent, SlideTarget } from "./state";

// Intent.platforms uses "android" | "ios" | "web"; the report's
// Platform type is the same shape, so the mapping is the identity.
// The channel mapping (intent enum -> renderer enum) lives in
// snapshot.ts because both files need it.
const REPORT_PLATFORM_LABEL: Record<"android" | "ios" | "web", string> = {
  android: "Android",
  ios: "iOS",
  web: "Web",
};

const REPORT_CHANNEL_LABEL: Record<
  ReturnType<typeof reportChannelFromIntent>,
  string
> = {
  meta: "Meta",
  google: "Google",
  tiktok: "TikTok",
  asa: "ASA",
  search: "Search",
};

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
  /** Recognised contact (workstream B chunk B4). When set, Atelier
   *  stamps Report.preparedFor for the cover byline. */
  contactName?: string | null;
};

export function assembleHermesReport(args: AssembleArgs): Report {
  const { intent, snapshot, bullets, runId, ownerUserId, contactName } = args;
  const grouped = groupBulletsBySlide(bullets);
  const client = findClient(intent.client);

  // Platform + channel come from intent (IntentSchema enforces >= 1 of
  // each). The previous hardcoding of "android"/"meta" meant a TikTok
  // on iOS request still emitted an "Android | Meta" deck, a real
  // trust-contract break.
  const platform = intent.platforms[0];
  const intentChannel = intent.channels[0];
  if (!platform) {
    throw new Error("assembleHermesReport: intent.platforms is empty");
  }
  if (!intentChannel) {
    throw new Error("assembleHermesReport: intent.channels is empty");
  }
  const channel = reportChannelFromIntent(intentChannel);
  const platformLabel = REPORT_PLATFORM_LABEL[platform];
  const channelLabel = REPORT_CHANNEL_LABEL[channel];

  // Honesty gate: when the BQ data is client-wide (every platform the
  // client runs on, not just the intent's platform), the deck must
  // NOT claim the platform in its section headers. Doing so would put
  // an "iOS | Overall" badge over numbers that include Android +
  // Web. Until the BQ pipeline gains a real platform predicate, every
  // Hermes snapshot is client-wide and the platform claim is dropped.
  // The intent's platform focus still surfaces through Quill bullets
  // (which cite the platform context from the email).
  const platformIsAuthoritative =
    snapshot.dataScope === "platform-filtered";
  const platformInTitle = platformIsAuthoritative ? `${platformLabel} | ` : "";
  const channelInTitle = platformIsAuthoritative
    ? `${channelLabel} | `
    : `${channelLabel} | `;

  const sections: ReportSection[] = [];

  if (snapshot.platformOverall) {
    const platformBullets = grouped.platform_overall;
    const section: PlatformOverallSection = {
      id: "platform_overall",
      platform,
      title: `${platformInTitle}Overall | Weekly Breakdown`,
      summary: snapshot.platformOverall,
      bullets: platformBullets.map((b, i) => bulletToWeekly(b, i === 0)),
    };
    sections.push(section);
  }

  if (snapshot.channelWeekly) {
    const weeklyBullets = grouped.channel_weekly;
    const section: ChannelWeeklySection = {
      id: "channel_weekly",
      platform,
      channel,
      title: `${platformInTitle}${channelInTitle}Weekly Breakdown`,
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
      platform,
      channel,
      title: `${platformInTitle}${channelInTitle}Campaign Breakdown`,
      rows: snapshot.channelCampaign.rows,
      commentary: campaignBullets.length
        ? campaignBullets.map((b, i) => bulletToCommentary(b, i))
        : [],
    };
    sections.push(section);
  }

  // Cover caveat: when the intent asked for a specific platform but
  // the data is client-wide, surface that on the cover so the reader
  // knows the headers do not silently scope. Reuses the existing
  // filterRange slot (manual reports use it for date-range narrowing;
  // Hermes drafts have no date narrowing because the period comes
  // straight from intent, so the slot is otherwise free).
  const scopeCaveat = !platformIsAuthoritative
    ? `Focus requested: ${platformLabel} / ${channelLabel}; numbers are client-wide across platforms`
    : undefined;

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
    filterRange: snapshot.period.filterRange ?? scopeCaveat,
    createdAt: now,
    updatedAt: now,
    authoredBy: "hermes",
    source: "hermes",
    agentRunId: runId,
    preparedFor: contactName ?? null,
    sections,
  };

  return report;
}
