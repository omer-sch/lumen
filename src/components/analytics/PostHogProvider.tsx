"use client";

import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import { useEffect } from "react";

// Query params we never want PostHog to see — they identify the client
// account and date window the user is looking at, which is information
// PostHog has no business holding even for an internal team.
const STRIPPED_QUERY_PARAMS = ["client", "from", "to"];

function stripUrl(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  try {
    const url = new URL(raw);
    let changed = false;
    for (const p of STRIPPED_QUERY_PARAMS) {
      if (url.searchParams.has(p)) {
        url.searchParams.delete(p);
        changed = true;
      }
    }
    return changed ? url.toString() : raw;
  } catch {
    return raw;
  }
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    const host = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

    if (!key) return; // silently skip if not configured (e.g. local dev without key)

    posthog.init(key, {
      api_host: host,
      person_profiles: "identified_only",
      capture_pageview: true,
      capture_pageleave: true,
      sanitize_properties: (properties) => {
        if (!properties) return properties;
        if (properties.$current_url) {
          properties.$current_url = stripUrl(properties.$current_url);
        }
        if (properties.$referrer) {
          properties.$referrer = stripUrl(properties.$referrer);
        }
        if (properties.$initial_current_url) {
          properties.$initial_current_url = stripUrl(
            properties.$initial_current_url,
          );
        }
        if (properties.$initial_referrer) {
          properties.$initial_referrer = stripUrl(properties.$initial_referrer);
        }
        return properties;
      },
    });
  }, []);

  return <PHProvider client={posthog}>{children}</PHProvider>;
}
