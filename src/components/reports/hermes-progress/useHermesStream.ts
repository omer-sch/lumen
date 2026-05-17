"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { HermesEvent } from "@/lib/agents/hermes/events";
import type { Intent } from "@/lib/analyst/types";
import type { ReportSection } from "@/lib/reports/types";

// Hook that POSTs to /api/agents/hermes/stream and surfaces each
// HermesEvent frame as React state.
//
// EventSource doesn't support POST out of the box, so we use
// fetch + a ReadableStream reader and parse SSE frames manually.
// SSE frames are newline-separated; each event ends with a blank
// line. We accumulate partial chunks across reads.

export type UseHermesStreamArgs = {
  /** When `null` the hook is idle. Set to a request body to start
   *  the stream. Setting back to null aborts an in-flight stream. */
  request: { emailText: string; actionNotes?: string } | null;
};

export type UseHermesStreamResult = {
  events: HermesEvent[];
  latest: HermesEvent | null;
  reportId: string | null;
  error: string | null;
  /** "idle" before request, "streaming" while events flow, "done"
   *  after deck_ready, "error" on failure. */
  status: "idle" | "streaming" | "done" | "error";
  /** First-pass intent surfaced from node_finished(parse_intent).
   *  The HermesDeckSkeleton uses this to derive the expected
   *  section list as soon as parse_intent finishes. */
  intent: Intent | null;
  /** Map of section_id -> rendered section as writer events land.
   *  Each entry is one completed section the skeleton can swap from
   *  shimmer to populated. */
  sectionsReady: Record<string, ReportSection>;
  reset: () => void;
};

export function useHermesStream(args: UseHermesStreamArgs): UseHermesStreamResult {
  const [events, setEvents] = useState<HermesEvent[]>([]);
  const [reportId, setReportId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<UseHermesStreamResult["status"]>("idle");
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setEvents([]);
    setReportId(null);
    setError(null);
    setStatus("idle");
  }, []);

  const { request } = args;

  useEffect(() => {
    if (!request) return;
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setEvents([]);
    setReportId(null);
    setError(null);
    setStatus("streaming");

    (async () => {
      try {
        const res = await fetch("/api/agents/hermes/stream", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            email_text: request.emailText.trim(),
            action_notes: request.actionNotes?.trim() || undefined,
          }),
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) {
          const body = await safeReadJson(res);
          throw new Error(body?.error ?? `HTTP ${res.status}`);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split("\n\n");
          // Last element is the partial frame; keep it in the buffer.
          buffer = frames.pop() ?? "";
          for (const frame of frames) {
            const event = parseSseFrame(frame);
            if (!event) continue;
            setEvents((cur) => [...cur, event]);
            if (event.type === "deck_ready") {
              setReportId(event.reportId);
              setStatus("done");
            } else if (event.type === "error") {
              setError(event.message);
              setStatus("error");
            }
          }
        }
      } catch (err) {
        if (ctrl.signal.aborted) return;
        const message = err instanceof Error ? err.message : String(err);
        setError(message);
        setStatus("error");
      }
    })();

    return () => {
      ctrl.abort();
    };
  }, [request]);

  // Derive intent + sectionsReady from the event stream.
  const intent = useMemo<Intent | null>(() => {
    for (let i = events.length - 1; i >= 0; i -= 1) {
      const ev = events[i];
      if (
        ev.type === "node_finished" &&
        ev.node === "parse_intent" &&
        ev.data?.kind === "parse_intent"
      ) {
        return ev.data.intent;
      }
    }
    return null;
  }, [events]);

  const sectionsReady = useMemo<Record<string, ReportSection>>(() => {
    const out: Record<string, ReportSection> = {};
    for (const ev of events) {
      if (ev.type === "section_ready") {
        out[ev.sectionId] = ev.section;
      }
    }
    return out;
  }, [events]);

  return {
    events,
    latest: events[events.length - 1] ?? null,
    reportId,
    error,
    status,
    intent,
    sectionsReady,
    reset,
  };
}

async function safeReadJson(
  res: Response,
): Promise<{ error?: string } | null> {
  try {
    return (await res.json()) as { error?: string };
  } catch {
    return null;
  }
}

function parseSseFrame(frame: string): HermesEvent | null {
  const trimmed = frame.trim();
  if (!trimmed) return null;
  // SSE frames may carry comments / multiple `data:` lines; we only
  // emit one data line per frame from the server so this is light.
  const lines = trimmed.split("\n");
  const dataLine = lines.find((l) => l.startsWith("data:"));
  if (!dataLine) return null;
  const json = dataLine.slice("data:".length).trim();
  try {
    return JSON.parse(json) as HermesEvent;
  } catch {
    return null;
  }
}
