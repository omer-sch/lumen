export type AgentStatus = "running" | "completed" | "scheduled";

/** Anomaly produced by Max — links into Feed. */
export type AnomalyOutput = {
  channel: "Meta" | "TikTok" | "Google" | "AppsFlyer";
  client: string;
  metric: string;
  delta: string;
  /** Direction matters for color — drop is creative, spike is mint. */
  direction: "up" | "down";
};

/** Image output for Aria — a procedurally described composition the agent
 *  generated. We render a CSS preview (no asset hosting yet). */
export type ImageOutput = {
  /** Human-readable composition title. */
  title: string;
  /** Two-stop gradient for the preview surface. */
  palette: { from: string; to: string };
  /** One-line description of what the agent built. */
  composition: string;
  /** Real Hugging Face FLUX.1-schnell render URL. Absent on mock/legacy runs. */
  imageUrl?: string;
};

/** Report output for Nova — opens in Reports later. */
export type ReportOutput = {
  title: string;
  /** Short executive-summary excerpt. */
  excerpt: string;
  /** Headline metrics included in the draft. */
  metrics: { label: string; value: string }[];
};

export type RunOutput =
  | { kind: "image"; data: ImageOutput }
  | { kind: "anomalies"; data: AnomalyOutput[] }
  | { kind: "report"; data: ReportOutput };

export type AgentRun = {
  id: string;
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
  /** Concrete output the agent produced — the thing the user actually opens. */
  output: RunOutput;
};

/** A persistent learning the agent has distilled from past feedback. */
export type AgentMemory = {
  id: string;
  /** Short rule the agent learned, written in the agent's voice. */
  rule: string;
  /** Where the rule came from — usually a dated note. */
  source: string;
  /** How many runs since adoption have applied this rule — yellow attention
   *  number on the chip. */
  appliedCount: number;
};

/** Live state for an agent currently running — drives the progress bar and
 *  the "step" label on the card. */
export type AgentLiveRun = {
  /** 0–100. */
  progress: number;
  /** Human-readable current step. */
  step: string;
};

/** One tool the agent leans on, surfaced in the toolkit panel as a pill. */
export type AgentTool = {
  /** Human-readable name, e.g. "BigQuery", "Virality predictor". */
  name: string;
  /** Lucide icon name resolved by AgentToolkit's icon map. */
  icon: string;
};

/** Toolkit copy + tool pills for the per-agent workspace page. */
export type AgentToolkit = {
  /** One-paragraph plain-language description of what the agent does. */
  sentence: string;
  /** Connected tools / services rendered as pills under the paragraph. */
  tools: AgentTool[];
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
  /** Total runs to date. */
  totalRuns: number;
  /** The headline metric label + value pair shown in the stats row. */
  keyMetric: { label: string; value: string };
  /** Last-run summary line shown in the card footer. */
  lastRun: string;
  /** Recent run history — last 3 entries, newest first. */
  history: AgentRun[];
  /** Patterns the agent has internalized from past feedback. */
  memory: AgentMemory[];
  /** Live progress, present iff status === "running". */
  liveRun?: AgentLiveRun;
  /** When true, the agent is paused — schedule is suspended until resumed. */
  paused?: boolean;
  /** Static placeholder for the playground stats line. */
  costThisWeek: string;
  /** Voice-of-agent speech bubble copy. `**token**` substring gets the yellow accent. */
  greeting: string;
  /** Toolkit panel copy + tool pills. */
  toolkit: AgentToolkit;
};

/**
 * Static per-agent playground config — greeting, weekly cost placeholder,
 * and toolkit. These fields are required on `Agent` but don't live in the
 * database yet; both the mock and the Postgres loader pull them from here
 * so the shape stays consistent.
 *
 * `**token**` substrings inside `greeting` get the yellow accent in the
 * speech bubble; only the key number should be marked.
 */
export const AGENT_PLAYGROUND: Record<
  "aria" | "max" | "nova",
  { costThisWeek: string; greeting: string; toolkit: AgentToolkit }
> = {
  aria: {
    costThisWeek: "$1.40",
    greeting:
      "Today's hero is ready. Virality predictor scored it **87**, that's people-will-love-this territory. Want to ship it, or should I try another angle?",
    toolkit: {
      sentence:
        "I check the daily Lumen feed at 10:00, write a hero prompt from your latest memory notes, send it through Hugging Face's FLUX.1-schnell pipeline, score it with the virality predictor, then queue the best result for your review.",
      tools: [
        { name: "FLUX.1 (Hugging Face)", icon: "Sparkles" },
        { name: "Virality predictor", icon: "TrendingUp" },
        { name: "Memory", icon: "Brain" },
        { name: "Lumen feed", icon: "Rss" },
      ],
    },
  },
  max: {
    costThisWeek: "$0.28",
    greeting:
      "Hey Omer. I scanned BigQuery at 08:00 and found **3** things worth your attention this morning. The biggest one is iOS CPI on Meta. Want me to walk you through it?",
    toolkit: {
      sentence:
        "I scan BigQuery every morning at 08:00 across all UA campaigns you run, compare today against the last 7 days, suppress noise you've thumbsed-down before, and send anything that survives to Feed and your notifications.",
      tools: [
        { name: "BigQuery", icon: "Database" },
        { name: "Memory", icon: "Brain" },
        { name: "Feed", icon: "Rss" },
        { name: "Notifications", icon: "Bell" },
      ],
    },
  },
  nova: {
    costThisWeek: "$0.62",
    greeting:
      "Your weekly UA summary is **80%** drafted. I led with ROAS this week since that was the big mover. Want to review, or have me try a different angle?",
    toolkit: {
      sentence:
        "Every Friday at 09:00 I pull the week's UA numbers, pick the metric that moved most, draft an executive summary in your voice, and assemble the full weekly report with charts and a recommendation.",
      tools: [
        { name: "BigQuery", icon: "Database" },
        { name: "Reports", icon: "FileText" },
        { name: "Memory", icon: "Brain" },
        { name: "Voice", icon: "MessageCircle" },
      ],
    },
  },
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
    liveRun: { progress: 62, step: "Rendering composition · pass 2 of 3" },
    costThisWeek: AGENT_PLAYGROUND.aria.costThisWeek,
    greeting: AGENT_PLAYGROUND.aria.greeting,
    toolkit: AGENT_PLAYGROUND.aria.toolkit,
    memory: [
      {
        id: "aria-mem-1",
        rule: "Reduce element count when virality < 75 — viewers prefer one focal subject.",
        source: "May 08 note · “too busy”",
        appliedCount: 3,
      },
      {
        id: "aria-mem-2",
        rule: "Lead with mint glow on the bulb; yellow stays an accent only.",
        source: "May 07 note · “mint dominant”",
        appliedCount: 5,
      },
      {
        id: "aria-mem-3",
        rule: "God-ray light shafts on dark navy reliably score above 80.",
        source: "May 09 note · “love the god rays”",
        appliedCount: 1,
      },
    ],
    history: [
      {
        id: "aria-run-1",
        date: "May 09",
        score: 81,
        note: "Love the god rays. Bulb could be bigger.",
        output: {
          kind: "image",
          data: {
            title: "Bulb in motion · god rays",
            palette: { from: "var(--color-ua)", to: "var(--color-yellow)" },
            composition:
              "Centered glass bulb floating on deep navy with three god-ray shafts, mint bloom on the filament, yellow rim flare upper-right.",
          },
        },
      },
      {
        id: "aria-run-2",
        date: "May 08",
        score: 74,
        note: "Too busy. Too many elements fighting.",
        output: {
          kind: "image",
          data: {
            title: "Cluttered hero · 7 elements",
            palette: { from: "var(--color-creative)", to: "var(--color-yellow)" },
            composition:
              "Bulb with floating particles, gradient overlay, secondary chart silhouette, badge mark, and signature curve — too many focal points.",
          },
        },
      },
      {
        id: "aria-run-3",
        date: "May 07",
        score: 78,
        note: "Good composition, mint dominant.",
        output: {
          kind: "image",
          data: {
            title: "Mint-led hero",
            palette: { from: "var(--color-ua)", to: "var(--color-ua-glow)" },
            composition:
              "Single bulb on dark navy, full mint glow, soft yellow whisper in the background bokeh — restrained and on-brand.",
          },
        },
      },
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
    costThisWeek: AGENT_PLAYGROUND.max.costThisWeek,
    greeting: AGENT_PLAYGROUND.max.greeting,
    toolkit: AGENT_PLAYGROUND.max.toolkit,
    memory: [
      {
        id: "max-mem-1",
        rule: "Suppress CPI spikes < 8% on Meta during weekend traffic — historically noise.",
        source: "Apr 21 thumbs-down on weekend false positive",
        appliedCount: 7,
      },
      {
        id: "max-mem-2",
        rule: "Surface ROAS drops > 12% with 3-day persistence as drops, not spikes.",
        source: "Apr 14 note · “only flag sustained drops”",
        appliedCount: 4,
      },
    ],
    history: [
      {
        id: "max-run-1",
        date: "May 10",
        score: 3,
        note: "3 anomalies found — CPI +34% Meta/GlobalComix, ROAS -18% TikTok/Playtika, Budget pace +12% Google/888.",
        output: {
          kind: "anomalies",
          data: [
            {
              channel: "Meta",
              client: "GlobalComix",
              metric: "CPI",
              delta: "+34%",
              direction: "up",
            },
            {
              channel: "TikTok",
              client: "Playtika",
              metric: "ROAS",
              delta: "-18%",
              direction: "down",
            },
            {
              channel: "Google",
              client: "888 Holdings",
              metric: "Budget pace",
              delta: "+12%",
              direction: "up",
            },
          ],
        },
      },
      {
        id: "max-run-2",
        date: "May 09",
        score: 1,
        note: "1 anomaly found — CPI spike on Meta/GlobalComix.",
        output: {
          kind: "anomalies",
          data: [
            {
              channel: "Meta",
              client: "GlobalComix",
              metric: "CPI",
              delta: "+22%",
              direction: "up",
            },
          ],
        },
      },
      {
        id: "max-run-3",
        date: "May 08",
        score: 0,
        note: "0 anomalies. All channels within expected ranges.",
        output: { kind: "anomalies", data: [] },
      },
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
    costThisWeek: AGENT_PLAYGROUND.nova.costThisWeek,
    greeting: AGENT_PLAYGROUND.nova.greeting,
    toolkit: AGENT_PLAYGROUND.nova.toolkit,
    memory: [
      {
        id: "nova-mem-1",
        rule: "Open with the headline ROAS delta, not the spend total — the team scans for outcome first.",
        source: "Apr 18 edit · re-ordered intro",
        appliedCount: 2,
      },
      {
        id: "nova-mem-2",
        rule: "Lead recommendations with the channel that moved most this week.",
        source: "Apr 25 note · “bury budget table, lead with what changed”",
        appliedCount: 1,
      },
    ],
    history: [
      {
        id: "nova-run-1",
        date: "May 02",
        rating: 4.9,
        note: "Weekly UA summary · GlobalComix",
        output: {
          kind: "report",
          data: {
            title: "Weekly UA summary · GlobalComix",
            excerpt:
              "ROAS climbed to 3.2x, the strongest week this quarter. TikTok creatives drove 41% of installs while CPI on Meta held steady. Recommend scaling the Hardcasual concept and retiring two underperforming static creatives.",
            metrics: [
              { label: "ROAS", value: "3.2x" },
              { label: "Spend", value: "$84.2k" },
              { label: "Installs", value: "21.8k" },
            ],
          },
        },
      },
      {
        id: "nova-run-2",
        date: "Apr 25",
        rating: 4.7,
        note: "Weekly UA summary · Playtika",
        output: {
          kind: "report",
          data: {
            title: "Weekly UA summary · Playtika",
            excerpt:
              "ROAS held at 2.8x against a 6% spend increase. UGC creatives outperformed studio ads on TikTok (+22% CTR). Recommend doubling UGC budget allocation next sprint.",
            metrics: [
              { label: "ROAS", value: "2.8x" },
              { label: "Spend", value: "$112.5k" },
              { label: "Installs", value: "34.0k" },
            ],
          },
        },
      },
      {
        id: "nova-run-3",
        date: "Apr 18",
        rating: 4.5,
        note: "Weekly UA summary · 888 Holdings",
        output: {
          kind: "report",
          data: {
            title: "Weekly UA summary · 888 Holdings",
            excerpt:
              "Budget pacing came in 8% over plan with mixed efficiency. Google App campaigns regressed; Meta held. Recommend reallocating 12% of Google spend back to Meta UAC for the next two weeks.",
            metrics: [
              { label: "ROAS", value: "1.9x" },
              { label: "Spend", value: "$67.3k" },
              { label: "Installs", value: "9.2k" },
            ],
          },
        },
      },
    ],
  },
];
