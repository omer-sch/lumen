// STUB(phase-2) replaced in phase 6. Atelier is now real.
import "server-only";

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import pptxgen from "pptxgenjs";

import {
  type Bullet,
  type Deck,
  type DeckSlide,
  type HermesState,
  type HermesStateUpdate,
  type SlideTarget,
} from "../state";

// Atelier · phase 6.
//
// Deterministic mapping from Hermes state (intent + findings + bullets)
// into a real .pptx written to /tmp/hermes-runs/<run_id>.pptx.
//
// Trade-off documented: the master plan calls for a "light Sonnet call
// to decide per-slide layout choices". v0 ships deterministic layout
// driven entirely by Quill's slide_target assignment. The Sonnet-layout
// pass and full reuse of src/lib/reports/export-pptx.ts (currently
// "use client" — needs to be split into a shared core + client/server
// wrappers) are queued. This implementation is a thin server-side
// writer that produces a real .pptx the demo can download today.

const HERMES_RUN_DIR = "/tmp/hermes-runs";
const PRIMARY_HEX = "54F0A3"; // brand-ua mint
const INK_HEX = "0A1428"; //    surface base
const PAPER_HEX = "FFFFFF";
const MUTED_HEX = "6B7280";

const SLIDE_TITLES: Record<SlideTarget, string> = {
  platform_overall: "Platform overall",
  channel_weekly: "Channel weekly",
  campaign_breakdown: "Campaign breakdown",
  closing: "Closing",
};

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

type PptxLike = pptxgen;

function addCoverSlide(
  pres: PptxLike,
  args: { client: string; period_label: string; bullet_count: number },
): void {
  const slide = pres.addSlide();
  slide.background = { color: INK_HEX };
  slide.addText("Hermes", {
    x: 0.5,
    y: 0.5,
    w: 9,
    h: 0.4,
    fontFace: "Bricolage Grotesque",
    fontSize: 16,
    color: PRIMARY_HEX,
    bold: true,
  });
  slide.addText(`${args.client} weekly review`, {
    x: 0.5,
    y: 1.2,
    w: 9,
    h: 1.2,
    fontFace: "Bricolage Grotesque",
    fontSize: 44,
    color: PAPER_HEX,
    bold: true,
  });
  slide.addText(args.period_label, {
    x: 0.5,
    y: 2.6,
    w: 9,
    h: 0.5,
    fontFace: "Montserrat",
    fontSize: 18,
    color: MUTED_HEX,
  });
  slide.addText(
    `Drafted by Hermes · ${args.bullet_count} bullets across ${Object.keys(SLIDE_TITLES).length} slides`,
    {
      x: 0.5,
      y: 4.8,
      w: 9,
      h: 0.4,
      fontFace: "Montserrat",
      fontSize: 12,
      color: MUTED_HEX,
    },
  );
}

function addBulletSlide(
  pres: PptxLike,
  args: { title: string; bullets: Bullet[]; continuation?: number },
): void {
  const slide = pres.addSlide();
  slide.background = { color: PAPER_HEX };
  const titleText =
    args.continuation && args.continuation > 0
      ? `${args.title} (cont.)`
      : args.title;
  slide.addText(titleText, {
    x: 0.5,
    y: 0.4,
    w: 9,
    h: 0.6,
    fontFace: "Bricolage Grotesque",
    fontSize: 28,
    color: INK_HEX,
    bold: true,
  });
  // Mint accent strip under the title.
  slide.addShape("rect", {
    x: 0.5,
    y: 1.1,
    w: 0.6,
    h: 0.08,
    fill: { color: PRIMARY_HEX },
    line: { color: PRIMARY_HEX },
  });
  // Body bullets.
  const bulletItems = args.bullets.map((b) => ({
    text: b.claim,
    options: {
      fontFace: "Montserrat",
      fontSize: 16,
      color: INK_HEX,
      bullet: { code: "25CF" },
      paraSpaceAfter: 8,
    },
  }));
  slide.addText(bulletItems.length === 0 ? [{ text: "(no items)", options: { color: MUTED_HEX } }] : bulletItems, {
    x: 0.5,
    y: 1.4,
    w: 9,
    h: 4.2,
    fontFace: "Montserrat",
    fontSize: 16,
    color: INK_HEX,
    valign: "top",
  });
  // Action items, if any, in a smaller mint pill row at the bottom.
  const actions = args.bullets
    .map((b) => b.action_item)
    .filter((a): a is string => Boolean(a));
  if (actions.length > 0) {
    slide.addText(
      actions.map((a, i) => ({
        text: `Action ${i + 1}: ${a}`,
        options: { fontFace: "Montserrat", fontSize: 11, color: PRIMARY_HEX, paraSpaceAfter: 4 },
      })),
      {
        x: 0.5,
        y: 5.4,
        w: 9,
        h: 1.5,
      },
    );
  }
}

function addClosingSlide(
  pres: PptxLike,
  args: { client: string; bullet_count: number; finding_count: number },
): void {
  const slide = pres.addSlide();
  slide.background = { color: INK_HEX };
  slide.addText("Closing", {
    x: 0.5,
    y: 1.0,
    w: 9,
    h: 0.6,
    fontFace: "Bricolage Grotesque",
    fontSize: 28,
    color: PRIMARY_HEX,
    bold: true,
  });
  slide.addText(
    `${args.client} review drafted from ${args.finding_count} findings and ${args.bullet_count} bullets. Human review next.`,
    {
      x: 0.5,
      y: 2.0,
      w: 9,
      h: 0.8,
      fontFace: "Montserrat",
      fontSize: 16,
      color: PAPER_HEX,
    },
  );
  slide.addText("Drafted by Hermes", {
    x: 0.5,
    y: 5.0,
    w: 9,
    h: 0.4,
    fontFace: "Montserrat",
    fontSize: 11,
    color: MUTED_HEX,
  });
}

const MAX_BULLETS_PER_SLIDE = 5;

function paginate(
  bullets: Bullet[],
  perSlide: number,
): Bullet[][] {
  if (bullets.length === 0) return [[]];
  const out: Bullet[][] = [];
  for (let i = 0; i < bullets.length; i += perSlide) {
    out.push(bullets.slice(i, i + perSlide));
  }
  return out;
}

export type AtelierWriteResult = {
  pptx_path: string;
  slides: DeckSlide[];
};

export async function buildHermesPptx(args: {
  run_id: string;
  client: string;
  period_label: string;
  bullets: Bullet[];
  finding_count: number;
  outputDir?: string;
}): Promise<AtelierWriteResult> {
  const pres = new pptxgen();
  pres.layout = "LAYOUT_WIDE";

  const groups = groupBulletsBySlide(args.bullets);
  const orderedTargets: SlideTarget[] = [
    "platform_overall",
    "channel_weekly",
    "campaign_breakdown",
    "closing",
  ];

  // Cover.
  addCoverSlide(pres, {
    client: args.client,
    period_label: args.period_label,
    bullet_count: args.bullets.length,
  });

  const manifest: DeckSlide[] = [
    { index: 0, layout: "cover", title: "Cover" },
  ];

  let slideIndex = 1;
  for (const target of orderedTargets) {
    if (target === "closing") continue; // closing slide is custom
    const pages = paginate(groups[target], MAX_BULLETS_PER_SLIDE);
    pages.forEach((page, i) => {
      addBulletSlide(pres, {
        title: SLIDE_TITLES[target],
        bullets: page,
        continuation: i,
      });
      manifest.push({
        index: slideIndex++,
        layout: target,
        title: i === 0 ? SLIDE_TITLES[target] : `${SLIDE_TITLES[target]} (cont.)`,
      });
    });
  }

  // Closing.
  addClosingSlide(pres, {
    client: args.client,
    bullet_count: args.bullets.length,
    finding_count: args.finding_count,
  });
  manifest.push({ index: slideIndex, layout: "closing", title: "Closing" });

  const dir = args.outputDir ?? HERMES_RUN_DIR;
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, `${args.run_id}.pptx`);
  // pptxgenjs writes to a Buffer in node when outputType=nodebuffer.
  const buffer = (await pres.write({ outputType: "nodebuffer" })) as Buffer;
  await writeFile(filePath, buffer);

  return { pptx_path: filePath, slides: manifest };
}

export async function atelier(
  state: HermesState,
): Promise<HermesStateUpdate> {
  const startedAt = new Date().toISOString();
  if (!state.intent || !state.run_id) {
    return {
      deck: { pptx_path: null, slides: [] },
      history: [
        {
          node: "atelier",
          started_at: startedAt,
          ended_at: new Date().toISOString(),
          notes: "skipped: missing intent or run_id",
        },
      ],
    };
  }

  const result = await buildHermesPptx({
    run_id: state.run_id,
    client: state.intent.client,
    period_label: state.intent.period.label,
    bullets: state.bullets,
    finding_count: state.findings.length,
  });

  const deck: Deck = {
    pptx_path: result.pptx_path,
    slides: result.slides,
  };

  return {
    deck,
    history: [
      {
        node: "atelier",
        started_at: startedAt,
        ended_at: new Date().toISOString(),
        notes: `wrote ${deck.slides.length}-slide pptx at ${result.pptx_path}`,
      },
    ],
  };
}
