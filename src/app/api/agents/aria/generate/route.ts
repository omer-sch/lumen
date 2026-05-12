import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/env.server";
import { getUserId } from "@/lib/db/user";
import { rateLimit } from "@/lib/rate-limit";

const HF_MODEL_URL =
  "https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell";

const MAX_PROMPT_LENGTH = 2000;
// Per-user budget. Image gen is expensive; 10/min is plenty for a real
// session and stops a runaway client from burning through HF_TOKEN.
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

export async function POST(request: Request) {
  const token = serverEnv.HF_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "HF_TOKEN not configured" },
      { status: 503 },
    );
  }

  // Defence-in-depth: the middleware already requires a Clerk session
  // for this path (even in PREVIEW mode), but we re-derive the user id
  // here so a future middleware regression can't turn this route into
  // an unauthenticated HF proxy.
  const userId = await getUserId();

  const limit = rateLimit(
    `aria:generate:${userId}`,
    RATE_LIMIT_MAX,
    RATE_LIMIT_WINDOW_MS,
  );
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Try again shortly." },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSeconds) },
      },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const prompt = (body as { prompt?: unknown } | null)?.prompt;
  if (typeof prompt !== "string" || prompt.length === 0) {
    return NextResponse.json(
      { error: "prompt is required (string)" },
      { status: 400 },
    );
  }
  if (prompt.length > MAX_PROMPT_LENGTH) {
    return NextResponse.json(
      { error: `prompt exceeds ${MAX_PROMPT_LENGTH} chars` },
      { status: 400 },
    );
  }

  const hfRes = await fetch(HF_MODEL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "image/jpeg",
    },
    body: JSON.stringify({ inputs: prompt }),
  });

  // HF returns JSON for errors / warm-up, binary for success.
  const contentType = hfRes.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");

  if (!hfRes.ok || isJson) {
    let upstreamBody: unknown;
    try {
      upstreamBody = isJson ? await hfRes.json() : await hfRes.text();
    } catch {
      upstreamBody = null;
    }

    const errMsg =
      typeof upstreamBody === "object" && upstreamBody !== null && "error" in upstreamBody
        ? String((upstreamBody as { error: unknown }).error ?? "")
        : "";
    const isLoading =
      hfRes.status === 503 || /loading/i.test(errMsg);

    if (isLoading) {
      const eta = (upstreamBody as { estimated_time?: number } | null)
        ?.estimated_time;
      console.warn("[aria/generate] HF model warming up", { eta });
      return NextResponse.json(
        {
          error:
            "Hugging Face model is warming up — try again in ~30 seconds.",
          estimated_time: eta,
        },
        { status: 503 },
      );
    }

    // Log the upstream body server-side for debugging, but never echo it
    // to the client — it can leak model names, account routing, and
    // upstream diagnostics.
    console.error("[aria/generate] HF error", {
      status: hfRes.status,
      body: upstreamBody,
    });
    return NextResponse.json(
      { error: "Image generation failed" },
      { status: hfRes.status >= 500 ? 502 : 500 },
    );
  }

  const buf = Buffer.from(await hfRes.arrayBuffer());
  const mime = contentType.split(";")[0]?.trim() || "image/jpeg";
  const imageUrl = `data:${mime};base64,${buf.toString("base64")}`;
  return NextResponse.json({ imageUrl });
}
