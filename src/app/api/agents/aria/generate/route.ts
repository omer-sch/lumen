import { NextResponse } from "next/server";
import { serverEnv } from "@/lib/env.server";

const HF_MODEL_URL =
  "https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell";

export async function POST(request: Request) {
  const token = serverEnv.HF_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: "HF_TOKEN not configured" },
      { status: 503 },
    );
  }

  const { prompt } = (await request.json()) as { prompt?: string };
  if (!prompt) {
    return NextResponse.json({ error: "prompt is required" }, { status: 400 });
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
    let body: unknown;
    try {
      body = isJson ? await hfRes.json() : await hfRes.text();
    } catch {
      body = null;
    }

    const errMsg =
      typeof body === "object" && body !== null && "error" in body
        ? String((body as { error: unknown }).error ?? "")
        : "";
    const isLoading =
      hfRes.status === 503 || /loading/i.test(errMsg);

    if (isLoading) {
      const eta = (body as { estimated_time?: number } | null)?.estimated_time;
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

    console.error("[aria/generate] HF error", { status: hfRes.status, body });
    return NextResponse.json(
      { error: errMsg || "Hugging Face request failed", body },
      { status: hfRes.status || 500 },
    );
  }

  const buf = Buffer.from(await hfRes.arrayBuffer());
  const mime = contentType.split(";")[0]?.trim() || "image/jpeg";
  const imageUrl = `data:${mime};base64,${buf.toString("base64")}`;
  return NextResponse.json({ imageUrl });
}
