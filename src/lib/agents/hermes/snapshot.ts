import "server-only";

import { findClient } from "@/lib/mock/clients";
import {
  assignCallouts,
  buildMetaCampaignRows,
  buildMetaHistory,
  sumRows,
} from "@/lib/reports/generate";
import type { WeeklySummaryRow } from "@/lib/reports/types";

import type { HermesSnapshot, Intent } from "./state";

// Snapshot builder. The structured data tables Atelier lifts into the
// Report's sections. Today this is mock-anchored (cloned from
// generate.ts's fixtures); the seam is here so a future iteration can
// overlay real BQ values without changing Atelier or the Report shape.
//
// Why mock-anchored today: GlobalComix BQ has known data gaps (installs
// is NULL in a high percentage of rows; the weekly-history slice would
// need its own aggregation). Shipping the architectural skeleton now
// with mock data lets Hermes draft a visually-complete report on every
// run; the BQ-to-snapshot overlay lands as a follow-up without touching
// Atelier, the Report type, or any downstream component.

function facebookRow(): WeeklySummaryRow {
  return {
    label: "Facebook",
    spend: { value: 6230, delta: -4.1, tone: "neutral" },
    substart: { value: 278, delta: -28.7, tone: "bad" },
    subD0: { value: 54, delta: -33.2, tone: "bad" },
    subD7: { value: 88, delta: -12.4, tone: "bad", maturing: true },
    cpSubstart: { value: 22.41, delta: 34.8, tone: "bad" },
    cpaD0: { value: 115.37, delta: 39.0, tone: "bad" },
    cpaD7: { value: 70.79, delta: 9.6, tone: "bad", maturing: true },
  };
}

function googleRow(): WeeklySummaryRow {
  return {
    label: "Google",
    spend: { value: 3580, delta: 6.2, tone: "good" },
    substart: { value: 165, delta: 12.3, tone: "good" },
    subD0: { value: 39, delta: 8.4, tone: "good" },
    subD7: { value: 66, delta: 3.1, tone: "good", maturing: true },
    cpSubstart: { value: 21.7, delta: -5.4, tone: "good" },
    cpaD0: { value: 91.79, delta: -2.1, tone: "good" },
    cpaD7: { value: 54.24, delta: -1.4, tone: "good", maturing: true },
  };
}

function tiktokRow(): WeeklySummaryRow {
  return {
    label: "TikTok",
    spend: { value: 1820, delta: -11.0, tone: "neutral" },
    substart: { value: 71, delta: -18.6, tone: "bad" },
    subD0: { value: 14, delta: -22.2, tone: "bad" },
    subD7: { value: 22, delta: -7.5, tone: "bad", maturing: true },
    cpSubstart: { value: 25.63, delta: 9.4, tone: "bad" },
    cpaD0: { value: 130.0, delta: 14.1, tone: "bad" },
    cpaD7: { value: 82.73, delta: 3.8, tone: "bad", maturing: true },
  };
}

export function buildHermesSnapshot(intent: Intent): HermesSnapshot {
  const client = findClient(intent.client);
  const rows = [facebookRow(), googleRow(), tiktokRow()];
  const campaignRows = buildMetaCampaignRows();
  assignCallouts(campaignRows);

  return {
    clientLabel: client.name,
    period: {
      label: intent.period.label,
      isoStart: intent.period.iso_start,
      isoEnd: intent.period.iso_end,
    },
    platformOverall: {
      rows,
      total: sumRows(rows),
    },
    channelWeekly: {
      currentWeek: facebookRow(),
      history: buildMetaHistory(),
    },
    channelCampaign: {
      rows: campaignRows,
    },
  };
}
