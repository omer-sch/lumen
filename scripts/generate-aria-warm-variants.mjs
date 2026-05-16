// Aria avatar re-render in the warm-studio style (Hermes-style canary).
//
// Same path as generate-hermes-variants.mjs: FLUX.1-schnell via HF inference
// router, three variants written into the preview folder. Leaves the
// existing public/avatars/aria.png and the aria_v{1,2,3}.png preview set
// untouched; Omer picks the keeper.
//
// Usage:
//   node --env-file=.env.local scripts/generate-aria-warm-variants.mjs
//
// Requires HF_TOKEN in .env.local.

import { writeFile } from "node:fs/promises";

const HF_MODEL_URL =
  "https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell";

const OUT_DIR =
  "/Users/omer/Documents/Claude/Projects/yellow head/agent-avatars-preview";

const VARIANTS = [
  {
    name: "aria_warm_v1.png",
    prompt:
      "3D Pixar-style cartoon character, female late 20s to early 30s, creative director personality. Short dark hair with a small black beret tilted on her head. Mint green eyes (#54F0A3). Wearing a black turtleneck. Warm friendly expression, slight smile, looking slightly up as if just looked up from her work. Soft volumetric 3D rendering, smooth skin shading, Pixar animation quality. Behind her, blurred, a creative studio wall with a mood board of pinned images and color swatches. A small mint green sticky note visible on the mood board. Soft warm studio lighting from a side window. Centered bust to upper-torso framing, square frame. Friendly, approachable, modern Pixar character style. NOT realistic, NOT flat illustration, NOT a video-game avatar tile.",
  },
  {
    name: "aria_warm_v2.png",
    prompt:
      "3D Pixar-style cartoon character, female late 20s to early 30s, creative director personality. Short dark hair with a small black beret. Mint green eyes (#54F0A3). Wearing a black turtleneck with a small mint green (#54F0A3) paint splash on the shoulder. Holding a thin paintbrush. Warm friendly expression, slight smile. Soft volumetric 3D rendering, smooth skin shading, Pixar animation quality. Behind her, blurred, an art easel with a canvas in progress and a jar of brushes. Soft warm studio lighting. Centered bust to upper-torso framing, square frame. Friendly, approachable, modern Pixar character style. NOT realistic, NOT flat illustration, NOT a video-game avatar tile.",
  },
  {
    name: "aria_warm_v3.png",
    prompt:
      "3D Pixar-style cartoon character, female late 20s to early 30s, creative director personality. Short dark hair with a small black beret. Mint green eyes (#54F0A3). Wearing a black turtleneck. Holding a stylus with a small mint green (#54F0A3) cap. Warm friendly expression, slight smile, looking up as if just looked up from her drawing tablet. Soft volumetric 3D rendering, smooth skin shading, Pixar animation quality. Behind her, blurred, a modern creative workspace with a drawing tablet on the desk and a softly glowing screen. Soft warm studio lighting. Centered bust to upper-torso framing, square frame. Friendly, approachable, modern Pixar character style. NOT realistic, NOT flat illustration, NOT a video-game avatar tile.",
  },
];

async function renderOne(token, variant) {
  const res = await fetch(HF_MODEL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "image/png",
    },
    body: JSON.stringify({ inputs: variant.prompt }),
  });

  const contentType = res.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  if (!res.ok || isJson) {
    const detail = isJson ? await res.json() : await res.text();
    throw new Error(
      `FLUX call failed for ${variant.name} (status ${res.status}): ${
        typeof detail === "string" ? detail : JSON.stringify(detail)
      }`,
    );
  }

  const buf = Buffer.from(await res.arrayBuffer());
  const outPath = `${OUT_DIR}/${variant.name}`;
  await writeFile(outPath, buf);
  return { path: outPath, bytes: buf.length };
}

async function main() {
  const token = process.env.HF_TOKEN;
  if (!token) {
    console.error("HF_TOKEN missing. Run with: node --env-file=.env.local scripts/generate-aria-warm-variants.mjs");
    process.exit(1);
  }

  const results = [];
  for (const variant of VARIANTS) {
    console.log(`Requesting ${variant.name} ...`);
    const out = await renderOne(token, variant);
    results.push(out);
    console.log(`  -> ${out.path} (${out.bytes} bytes)`);
  }

  console.log("\nSaved:");
  for (const r of results) {
    console.log(`  ${r.path}  ${r.bytes} bytes`);
  }
}

main().catch((err) => {
  console.error("Generator threw:", err?.message ?? err);
  process.exit(1);
});
