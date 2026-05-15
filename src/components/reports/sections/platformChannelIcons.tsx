import type { Channel, Platform } from "@/lib/reports/types";

// =============================================================================
// Brand-colored icons for the platforms and channels we render in reports.
// The goal is *instant* recognition by clients — green Android, blue Meta,
// 4-color Google, etc. Each icon is a simplified geometric representation
// using the official brand color palette; we don't reproduce exact logo
// artwork, but the color + silhouette combination reads as the right
// brand at a glance.
//
// Same module is consumed by:
//   - the carousel SectionDivider (React component)
//   - the PPTX exporter (`addImage({ data: dataUri })`)
// One source means one place to tweak when a brand refreshes.
// =============================================================================

type IconKey = Platform | Channel;

type IconDef = {
  /** Inner SVG markup with explicit fills. No `currentColor` — brand
   *  icons keep their colors regardless of parent CSS context. */
  paths: string;
  /** Background tone for the badge that wraps the icon. "white" works for
   *  every icon since brand colors pop against white; we override per-
   *  icon if a brand-tinted backdrop is more recognizable (e.g. TikTok). */
  badge: "white" | "black";
};

const ICONS: Record<IconKey, IconDef> = {
  // Android — green helmet head with navy eyes and antennae.
  android: {
    paths: `
      <line x1="7" y1="4.5" x2="8.4" y2="7.5" stroke="#3DDC84" stroke-width="1.6" stroke-linecap="round"/>
      <line x1="17" y1="4.5" x2="15.6" y2="7.5" stroke="#3DDC84" stroke-width="1.6" stroke-linecap="round"/>
      <path d="M5.4 9.8C6.8 8 9.2 6.8 12 6.8s5.2 1.2 6.6 3c1.4 1.6 2.4 3.8 2.4 6.4H3c0-2.6 1-4.8 2.4-6.4Z" fill="#3DDC84"/>
      <circle cx="9" cy="12.8" r="1.05" fill="#0A1428"/>
      <circle cx="15" cy="12.8" r="1.05" fill="#0A1428"/>
    `,
    badge: "white",
  },

  // iOS — black apple silhouette with leaf.
  ios: {
    paths: `
      <path d="M16.6 12.7c0-2 1.6-3 1.7-3.1-.9-1.4-2.4-1.6-2.9-1.6-1.2-.1-2.4.7-3 .7-.6 0-1.6-.7-2.6-.7-1.4 0-2.6.8-3.3 2-1.4 2.5-.4 6.1 1 8.1.7 1 1.5 2 2.5 2 1 0 1.4-.6 2.6-.6s1.6.6 2.6.6c1.1 0 1.8-1 2.4-2 .8-1.1 1.1-2.2 1.1-2.3 0 0-2.1-.8-2.1-3.1Z" fill="#000000"/>
      <path d="M14.5 6.6c.5-.6.9-1.6.8-2.5-.8 0-1.7.5-2.3 1.2-.5.6-1 1.5-.8 2.4.9.1 1.8-.4 2.3-1.1Z" fill="#000000"/>
    `,
    badge: "white",
  },

  // Web — neutral indigo globe.
  web: {
    paths: `
      <circle cx="12" cy="12" r="8.5" fill="#4F46E5"/>
      <ellipse cx="12" cy="12" rx="3.6" ry="8.5" fill="none" stroke="#FFFFFF" stroke-width="1"/>
      <line x1="3.5" y1="12" x2="20.5" y2="12" stroke="#FFFFFF" stroke-width="1"/>
      <path d="M12 3.5c2 2 3.4 5 3.4 8.5 0 3.5-1.4 6.5-3.4 8.5-2-2-3.4-5-3.4-8.5C8.6 8.5 10 5.5 12 3.5Z" fill="none" stroke="#FFFFFF" stroke-width="1"/>
    `,
    badge: "white",
  },

  // Meta — blue infinity ribbon (single-color simplified take on the
  // Meta wordmark glyph).
  meta: {
    paths: `
      <path d="M4 12c0-2.6 2-4.6 4.4-4.6 1.9 0 3.1 1.3 4.1 2.8.9 1.4 1.8 3 3 3 1.1 0 1.9-.9 1.9-2.1 0-1.2-.8-2.1-1.9-2.1-.6 0-1.1.3-1.6.9l-1.4-1.6c.9-.9 2-1.5 3.1-1.5 2.4 0 4.4 2 4.4 4.6 0 2.6-2 4.6-4.4 4.6-1.9 0-3.1-1.3-4.1-2.8-.9-1.4-1.8-3-3-3-1.1 0-1.9.9-1.9 2.1 0 1.2.8 2.1 1.9 2.1.6 0 1.1-.3 1.6-.9l1.4 1.6c-.9.9-2 1.5-3.1 1.5C6 16.6 4 14.6 4 12Z" fill="#0866FF"/>
    `,
    badge: "white",
  },

  // Google — 4-color G using the official red/yellow/green/blue palette.
  // Simplified as a circle with colored arc segments and a horizontal
  // blue bar for the G crossbar.
  google: {
    paths: `
      <path d="M12 4a8 8 0 0 1 5.66 2.34l-2.34 2.34A4.66 4.66 0 0 0 12 7.34v-3.34Z" fill="#EA4335"/>
      <path d="M17.66 6.34A8 8 0 0 1 20 12h-3.34a4.66 4.66 0 0 0-1.34-3.32l2.34-2.34Z" fill="#FBBC04"/>
      <path d="M20 12a8 8 0 0 1-8 8v-3.34A4.66 4.66 0 0 0 16.66 12H20Z" fill="#34A853"/>
      <path d="M12 20a8 8 0 1 1 0-16v3.34A4.66 4.66 0 1 0 12 16.66V20Z" fill="#4285F4"/>
      <rect x="11.5" y="11" width="6.5" height="2" fill="#4285F4"/>
    `,
    badge: "white",
  },

  // TikTok — black music note with cyan + magenta offset shadows for the
  // signature chromatic-aberration look.
  tiktok: {
    paths: `
      <path d="M16 3.5h-2.6v11.7c0 1.2-1 2.2-2.2 2.2s-2.2-1-2.2-2.2c0-1.2 1-2.2 2.2-2.2.2 0 .4 0 .5.1V10.5c-.2 0-.3-.1-.5-.1-2.7 0-4.8 2.2-4.8 4.8s2.2 4.8 4.8 4.8 4.8-2.2 4.8-4.8V8.4c1.1 1 2.6 1.6 4.2 1.6V7.4c-1.8 0-3.4-1.5-3.4-3.4 0-.1 0-.3 0-.5h-.8Z" fill="#25F4EE" transform="translate(-1 -1)"/>
      <path d="M16 3.5h-2.6v11.7c0 1.2-1 2.2-2.2 2.2s-2.2-1-2.2-2.2c0-1.2 1-2.2 2.2-2.2.2 0 .4 0 .5.1V10.5c-.2 0-.3-.1-.5-.1-2.7 0-4.8 2.2-4.8 4.8s2.2 4.8 4.8 4.8 4.8-2.2 4.8-4.8V8.4c1.1 1 2.6 1.6 4.2 1.6V7.4c-1.8 0-3.4-1.5-3.4-3.4 0-.1 0-.3 0-.5h-.8Z" fill="#FE2C55" transform="translate(1 1)"/>
      <path d="M16 3.5h-2.6v11.7c0 1.2-1 2.2-2.2 2.2s-2.2-1-2.2-2.2c0-1.2 1-2.2 2.2-2.2.2 0 .4 0 .5.1V10.5c-.2 0-.3-.1-.5-.1-2.7 0-4.8 2.2-4.8 4.8s2.2 4.8 4.8 4.8 4.8-2.2 4.8-4.8V8.4c1.1 1 2.6 1.6 4.2 1.6V7.4c-1.8 0-3.4-1.5-3.4-3.4 0-.1 0-.3 0-.5h-.8Z" fill="#000000"/>
    `,
    badge: "white",
  },

  // Apple Search Ads — rounded blue badge with white magnifying glass.
  asa: {
    paths: `
      <rect x="2" y="2" width="20" height="20" rx="5" fill="#007AFF"/>
      <circle cx="11" cy="11" r="3.2" fill="none" stroke="#FFFFFF" stroke-width="1.8"/>
      <line x1="13.4" y1="13.4" x2="17" y2="17" stroke="#FFFFFF" stroke-width="1.8" stroke-linecap="round"/>
    `,
    badge: "white",
  },

  // Generic search / SEO — neutral magnifying glass.
  search: {
    paths: `
      <circle cx="11" cy="11" r="6" fill="none" stroke="#4285F4" stroke-width="1.8"/>
      <line x1="15.5" y1="15.5" x2="20" y2="20" stroke="#4285F4" stroke-width="2" stroke-linecap="round"/>
    `,
    badge: "white",
  },
};

const VIEWBOX = "0 0 24 24";

// ---------------------------------------------------------------------------
// React component
// ---------------------------------------------------------------------------

type PlatformChannelIconProps = {
  name: IconKey;
  className?: string;
  /** Title for accessibility / hover tooltip. */
  title?: string;
};

/**
 * Compact inline icon for the named platform or channel, rendered in
 * brand colors. Wrap in a white circular badge (use `iconBadgeStyle`) so
 * the brand colors stay legible against any background.
 */
export function PlatformChannelIcon({
  name,
  className,
  title,
}: PlatformChannelIconProps) {
  const def = ICONS[name];
  if (!def) return null;
  return (
    <svg
      role={title ? "img" : "presentation"}
      aria-hidden={title ? undefined : true}
      aria-label={title}
      viewBox={VIEWBOX}
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      dangerouslySetInnerHTML={{ __html: def.paths }}
    />
  );
}

/** Inline style for the round backdrop the icon sits inside. Returned as
 *  a React.CSSProperties so callers can mix it with className-driven
 *  size + position. */
export function iconBadgeStyle(name: IconKey): React.CSSProperties {
  const def = ICONS[name];
  const isBlack = def?.badge === "black";
  return {
    background: isBlack ? "#0A1428" : "#FFFFFF",
    border: isBlack
      ? "1px solid rgba(255,255,255,0.18)"
      : "1px solid rgba(10,20,40,0.08)",
  };
}

// ---------------------------------------------------------------------------
// PPTX-side helper: standalone SVG string + base64 data URI
// ---------------------------------------------------------------------------

export type IconBadgeTone = "white" | "black";

/** Tone used by the PPTX exporter to pick a backdrop color matching what
 *  the React component renders. */
export function iconBadgeTone(name: IconKey): IconBadgeTone {
  return ICONS[name]?.badge ?? "white";
}

/**
 * Produces a self-contained SVG string for the named icon. Brand colors
 * stay as-is; the icon needs no recoloring because each glyph already
 * carries its brand palette.
 */
export function platformChannelSvg(name: IconKey): string {
  const def = ICONS[name];
  if (!def) return "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEWBOX}">${def.paths}</svg>`;
}

/**
 * Base64 data URI for pptxgenjs's `addImage({ data: ... })`.
 */
export function platformChannelDataUri(name: IconKey): string {
  const svg = platformChannelSvg(name);
  const base64 =
    typeof btoa === "function"
      ? btoa(svg)
      : Buffer.from(svg, "utf8").toString("base64");
  return `data:image/svg+xml;base64,${base64}`;
}
