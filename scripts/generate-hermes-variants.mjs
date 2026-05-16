// Hermes avatar re-render — v1/v2/v3 variants.
//
// Mirrors generate-hermes-avatar.mjs (FLUX.1-schnell via HF inference router)
// but writes three variants into the preview folder, leaving
// public/avatars/hermes.png untouched. Omer picks the keeper.
//
// Usage:
//   node --env-file=.env.local scripts/generate-hermes-variants.mjs
//
// Requires HF_TOKEN in .env.local.

import { writeFile } from "node:fs/promises";

const HF_MODEL_URL =
  "https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell";

const OUT_DIR =
  "/Users/omer/Documents/Claude/Projects/yellow head/agent-avatars-preview";

const VARIANTS = [
  {
    name: "hermes_v1.png",
    prompt:
      "3D Pixar-style cartoon character avatar, male mid-to-late 20s, trustworthy messenger personality. Big expressive eyes, warm alert helpful expression, slight smile. Short neat dark hair with a small mint green (#54F0A3) wing-shaped tuft on top. Wearing a mint green collared shirt or jacket, no orange or coral anywhere. Holding a folded white envelope forward with a mint wax-seal detail visible. Soft volumetric 3D rendering, smooth skin shading, cinematic character lighting. Dark navy background (#0A1428), solid, NO environment, NO office, NO blur. Mint green (#54F0A3) rim light from behind. Centered bust portrait, square frame. Playful, friendly, game avatar style. NOT realistic, NOT flat illustration.",
  },
  {
    name: "hermes_v2.png",
    prompt:
      "3D Pixar-style cartoon character avatar, male mid-to-late 20s, careful messenger personality. Big expressive eyes, alert helpful expression, warm smile. Wears a fitted dark cap with a small mint green (#54F0A3) wing motif on the side. Mint green collar accent on his outfit, no orange or coral anywhere. Holding a folded slide deck under one arm, visible in the bust frame. Soft volumetric 3D rendering, smooth skin shading, cinematic character lighting. Dark navy background (#0A1428), solid, NO environment, NO office, NO blur. Mint green (#54F0A3) rim light from the right. Centered bust portrait, square frame. Playful, friendly, game avatar style. NOT realistic, NOT flat illustration.",
  },
  {
    name: "hermes_v3.png",
    prompt:
      "3D Pixar-style cartoon character avatar, male mid-to-late 20s, fast studious messenger personality. Big expressive eyes, focused helpful expression, slight smile. Wears modern dark over-ear headphones with small mint green (#54F0A3) wing details on the side cups. Short tidy dark hair. Mint green messenger bag strap visible across his chest, no orange or coral anywhere. Soft volumetric 3D rendering, smooth skin shading, cinematic character lighting. Dark navy background (#0A1428), solid, NO environment, NO office, NO blur. Mint green (#54F0A3) rim light from the left. Centered bust portrait, square frame. Playful, friendly, game avatar style. NOT realistic, NOT flat illustration.",
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
    console.error("HF_TOKEN missing. Run with: node --env-file=.env.local scripts/generate-hermes-variants.mjs");
    process.exit(1);
  }

  const results = [];
  for (const variant of VARIANTS) {
    console.log(`Requesting ${variant.name} ...`);
    // Sequential to stay friendly to HF rate limits / warm-up behaviour.
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
