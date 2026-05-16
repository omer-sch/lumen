"use server";

import {
  generateReport,
  type ReportChannel,
  type ReportPlatform,
} from "@/lib/reports/generate";
import type { Report } from "@/lib/reports/types";

// Server action for the manual Reports builder. Wraps the BQ-backed
// generateReport() so the "use client" ReportsView can invoke it
// without importing the server-only generate module directly. Args
// cross the wire as JSON, so `from` and `to` are passed as ISO date
// strings and parsed on the server.

const PLATFORM_VALUES: readonly ReportPlatform[] = [
  "android",
  "ios",
  "web",
] as const;
const CHANNEL_VALUES: readonly ReportChannel[] = [
  "meta",
  "google",
  "tiktok",
  "apple_search_ads",
] as const;

export type GenerateReportActionInput = {
  prompt: string;
  fromIso: string;
  toIso: string;
  client: string;
  /** Optional analyst notes ("What did you do this week?"). Forwarded
   *  to Smart Reports's action-items parser. */
  actionNotes?: string;
  /** Platform multi-select. At least one required. */
  platforms: ReportPlatform[];
  /** Channel multi-select. At least one required. */
  channels: ReportChannel[];
};

export type GenerateReportActionResult =
  | { ok: true; report: Report }
  | { ok: false; error: string };

function validatePlatforms(input: unknown): ReportPlatform[] | null {
  if (!Array.isArray(input)) return null;
  const out: ReportPlatform[] = [];
  for (const v of input) {
    if (typeof v === "string" && (PLATFORM_VALUES as readonly string[]).includes(v)) {
      out.push(v as ReportPlatform);
    }
  }
  return out.length > 0 ? out : null;
}

function validateChannels(input: unknown): ReportChannel[] | null {
  if (!Array.isArray(input)) return null;
  const out: ReportChannel[] = [];
  for (const v of input) {
    if (typeof v === "string" && (CHANNEL_VALUES as readonly string[]).includes(v)) {
      out.push(v as ReportChannel);
    }
  }
  return out.length > 0 ? out : null;
}

export async function generateReportAction(
  input: GenerateReportActionInput,
): Promise<GenerateReportActionResult> {
  try {
    const from = new Date(input.fromIso);
    const to = new Date(input.toIso);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return { ok: false, error: "Invalid date range" };
    }
    const platforms = validatePlatforms(input.platforms);
    const channels = validateChannels(input.channels);
    if (!platforms) {
      return { ok: false, error: "Pick at least one platform." };
    }
    if (!channels) {
      return { ok: false, error: "Pick at least one channel." };
    }
    const report = await generateReport({
      prompt: input.prompt,
      from,
      to,
      client: input.client,
      actionNotes: input.actionNotes,
      platforms,
      channels,
    });
    return { ok: true, report };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
