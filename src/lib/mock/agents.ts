export type AgentStatus = "running" | "completed" | "scheduled";

export type AgentRun = {
  /** Display date — e.g. "May 09". */
  date: string;
  /** 0–100 quality / virality score for the run. Optional for runs that report
   *  a different primary metric (e.g. anomalies found). */
  score?: number;
  /** 0–5 rating, used by Nova where output is qualitatively rated. */
  rating?: number;
  /** Free-form note attached to the run — what the agent did, what was good,
   *  what to improve. */
  note: string;
};

export type Agent = {
  id: string;
  /** Friendly first name — used as the headline on the card. */
  name: string;
  /** Role / agent type — sub-headline on the card. */
  role: string;
  /** One-paragraph plain-language description of what the agent does. */
  description: string;
  status: AgentStatus;
  /** Human-readable schedule, e.g. "Daily · 10:00am". */
  schedule: string;
  /** Total runs to date. Yellow on the card — this is an "attention" number. */
  totalRuns: number;
  /** The headline metric label + value pair shown in the stats row. */
  keyMetric: { label: string; value: string };
  /** Last-run summary line shown in the card footer. */
  lastRun: string;
  /** Recent run history — last 3 entries, newest first. */
  history: AgentRun[];
};

export const AGENTS: Agent[] = [
  {
    id: "aria",
    name: "Aria",
    role: "Image Agent",
    description:
      "Generates a daily branded Lumen hero image. Learns from virality scores and your feedback.",
    status: "running",
    schedule: "Daily · 10:00am",
    totalRuns: 14,
    keyMetric: { label: "Last virality", value: "81" },
    lastRun: "Running now · today 10:00am",
    history: [
      { date: "May 09", score: 81, note: "Love the god rays. Bulb could be bigger." },
      { date: "May 08", score: 74, note: "Too busy. Too many elements fighting." },
      { date: "May 07", score: 78, note: "Good composition, mint dominant." },
    ],
  },
  {
    id: "max",
    name: "Max",
    role: "Anomaly Scanner",
    description:
      "Scans BigQuery every morning for CPI spikes, ROAS drops, and budget anomalies across UA clients.",
    status: "completed",
    schedule: "Daily · 08:00am",
    totalRuns: 89,
    keyMetric: { label: "Found today", value: "3" },
    lastRun: "Completed · today 08:04am · sent to Feed",
    history: [
      {
        date: "May 10",
        score: 3,
        note: "3 anomalies found — CPI +34% Meta/GlobalComix, ROAS -18% TikTok/Playtika, Budget pace +12% Google/888.",
      },
      { date: "May 09", score: 1, note: "1 anomaly found — CPI spike on Meta/GlobalComix." },
      { date: "May 08", score: 0, note: "0 anomalies. All channels within expected ranges." },
    ],
  },
  {
    id: "nova",
    name: "Nova",
    role: "Report Writer",
    description:
      "Drafts the weekly UA performance summary. Learns from edits you make to its output.",
    status: "scheduled",
    schedule: "Weekly · Fridays 09:00",
    totalRuns: 26,
    keyMetric: { label: "Avg rating", value: "4.8" },
    lastRun: "Next run · Fri 09:00",
    history: [
      { date: "May 02", rating: 4.9, note: "Weekly UA summary · GlobalComix" },
      { date: "Apr 25", rating: 4.7, note: "Weekly UA summary · Playtika" },
      { date: "Apr 18", rating: 4.5, note: "Weekly UA summary · 888 Holdings" },
    ],
  },
];
