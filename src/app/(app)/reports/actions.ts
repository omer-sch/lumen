"use server";

import { generateReport } from "@/lib/reports/generate";
import type { Report } from "@/lib/reports/types";

// Server action for the manual Reports builder. Wraps the BQ-backed
// generateReport() so the "use client" ReportsView can invoke it
// without importing the server-only globalcomix-queries module
// directly. Args cross the wire as JSON, so `from` and `to` are
// passed as ISO date strings and parsed on the server.

export type GenerateReportActionInput = {
  prompt: string;
  fromIso: string;
  toIso: string;
  client: string;
};

export type GenerateReportActionResult =
  | { ok: true; report: Report }
  | { ok: false; error: string };

export async function generateReportAction(
  input: GenerateReportActionInput,
): Promise<GenerateReportActionResult> {
  try {
    const from = new Date(input.fromIso);
    const to = new Date(input.toIso);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      return { ok: false, error: "Invalid date range" };
    }
    const report = await generateReport({
      prompt: input.prompt,
      from,
      to,
      client: input.client,
    });
    return { ok: true, report };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: message };
  }
}
