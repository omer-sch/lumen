// v0.5 workstream B chunk B1 · Hermes avatar generator.
//
// Mirrors the FLUX.1-schnell wiring in src/app/api/agents/aria/generate
// so Hermes lands in the same Pixar-3D house style as Aria/Max/Nova.
// One-off: run once, commit the resulting public/avatars/hermes.png,
// then this script is reference only.
//
// Usage:
//   node --env-file=.env.local scripts/generate-hermes-avatar.mjs
//
// Requires HF_TOKEN in .env.local.

import { writeFile } from "node:fs/promises";
import path from "node:path";

const HF_MODEL_URL =
  "https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell";

const PROMPT = [
  "A Pixar-style 3D cartoon avatar of a friendly young messenger character.",
  "Soft mint green accent (UA team color).",
  "Holds a small floating envelope.",
  "Warm office lighting.",
  "Friendly expression with bright eyes.",
  "Clean studio-portrait composition.",
  "Soft blurred background.",
  "High-quality 3D render, smooth surfaces, expressive face.",
  "Square 1:1 framing. 256x256.",
].join(" ");

const OUTPUT_PATH = path.join(process.cwd(), "public", "avatars", "hermes.png");

async function main() {
  const token = process.env.HF_TOKEN;
  if (!token) {
    console.error("HF_TOKEN missing. Add it to .env.local then re-run.");
    process.exit(1);
  }

  console.log("Requesting FLUX.1-schnell ...");
  const res = await fetch(HF_MODEL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "image/png",
    },
    body: JSON.stringify({ inputs: PROMPT }),
  });

  const contentType = res.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  if (!res.ok || isJson) {
    const detail = isJson ? await res.json() : await res.text();
    console.error("FLUX call failed:", res.status, detail);
    process.exit(2);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(OUTPUT_PATH, buf);
  console.log(`Wrote ${buf.length} bytes to ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error("Generator threw:", err);
  process.exit(1);
});
