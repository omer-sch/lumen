import type { CampaignRow } from "@/types/dashboard";

// Campaign-name classifier for GlobalComix's naming convention.
//
// Why this is a token-scan parser, not a fixed-position regex
// ---------------------------------------------------------------
// The first cut of this classifier assumed a single canonical layout
//
//   YH_<NET>_APP_<TIER>_<MON>_<TYPE>_<PLAT>_<SEAS>_<GEO>
//
// taken from the iOS Meta table screenshot in the Week 18 reference
// deck. A live BQ pull (see scripts/discover-globalcomix-campaign-names.ts
// + tmp/globalcomix-classifier-coverage.md) showed five distinct
// sub-patterns in production:
//
//   APP / FULL / IAP    (iOS Meta, original spec)
//     YH_FB_APP_FULL_IAP_Sub_iOS_Evergreen_WW
//   APP / FULL / ALL_IAP (Google, extra ALL slot)
//     YH_GG_APP_FULL_ALL_IAP_SubStart_Android_Evergreen_TopGeos
//   APP / FULL / no-IAP  (TikTok, IAP token dropped)
//     YH_TT_APP_FULL_Sub_Android_Evergreen_WW-Top
//   APP / RTG / variants (retargeting; tier becomes the family marker)
//     YH_FB_APP_RTG_IAP_SubStart_iOS_Evergreen_WW
//     YH_TT_APP_RTG_SubStart_iOS_Evergreen_US
//   APP / SRCH           (ASA, 7-segment SRCH layout)
//     YH_ASA_APP_SRCH_Generic_iOS_WW
//   Web SRCH             (Google Web search)
//     YH_GG_Web_SRCH_Brand_IAP_Sub+Trial_Evergreen_TopGeos
//
// Anchoring on positions breaks the moment a single token shifts. We
// scan the split parts for known vocabulary instead — every analyst-
// meaningful token (TYPE, PLATFORM, SEASONALITY) is a finite, small
// set, so a scan is robust to shape drift and self-documenting.
//
// What the classifier returns
// ---------------------------
//   family       — human label combining TYPE + SEASONALITY (or "RTG"
//                  when the tier slot says RTG). Examples: "Sub
//                  Evergreen", "SubStart RTG", "SubStart Seasonal",
//                  "Trial Evergreen", "Brand", "Generic". For pure
//                  search-keyword campaigns (Brand / Generic / Comp /
//                  Category / Archetype-*) the family is just the
//                  TYPE because there is no seasonality slot.
//   geo          — trailing geo token, hyphens preserved ("WW-Top",
//                  "WW-EU", "TopGeos", "T1"). Stripped of trailing
//                  punctuation noise ("." / " (GAB)").
//   campaignType — the SEASONALITY token, or "RTG" when tier=RTG, or
//                  the raw search-keyword type for ASA / Web SRCH.
//   platform     — iOS / Android / Web. Empty when not parseable.
//
// What falls back to "Other"
// --------------------------
//   Names that don't start with "YH_" (legacy / hand-named campaigns).
//   Names where neither TYPE nor SEASONALITY can be found.
//   The Phase 1 prose-writer will group these as "Other Campaigns" so
//   they are not silently dropped from the deck.

export type CampaignClassification = {
  family: string;
  geo: string;
  campaignType: string;
  platform: string;
};

const FALLBACK: CampaignClassification = {
  family: "Other",
  geo: "Unknown",
  campaignType: "Unknown",
  platform: "",
};

// Known tokens. Membership tests are case-sensitive; the warehouse
// produces these tokens with canonical casing. A future drift (e.g. a
// new "Subscription" token) earns an entry here, not a regex change.
const TYPE_TOKENS = new Set([
  "Sub",
  "SubStart",
  "Trial",
  "Sub+Trial",
]);

const SEARCH_TYPE_TOKENS = new Set([
  "Brand",
  "NonBrand",
  "Generic",
  "Comp",
  "Competitor",
  "Category",
]);

// Archetype-* compounds are handled by prefix match; the full token
// like "Archetype-Horror" / "Archetype-Manga" stays intact as the type.
const PLATFORM_TOKENS = new Set(["iOS", "Android", "Web"]);

const SEASONALITY_TOKENS = new Set([
  "Evergreen",
  "Seasonal",
  "Archetype",
]);

// Geo token shapes the warehouse currently emits. Keeping a lenient
// "looks-like-a-geo" predicate rather than a hard set so a new geo
// ("WW-LATAM", "EU", "EU-South") flows through without a code change.
const KNOWN_GEO_PATTERNS = [
  /^US$/,
  /^WW$/,
  /^WW-.+$/,
  /^India$/,
  /^TopGeos$/,
  /^OtherGeos$/,
  /^T\d$/,
  /^T\d\+T\d$/,
  /^EU$/,
  /^APAC$/,
];

/**
 * Classify a campaign name into family / geo / campaignType / platform.
 *
 * Never throws. Returns the "Other" fallback when neither TYPE nor
 * SEASONALITY can be identified.
 */
export function classifyCampaignName(name: string): CampaignClassification {
  if (typeof name !== "string" || name.length === 0) return FALLBACK;
  // Strip trailing punctuation/annotation noise the warehouse sometimes
  // appends to a campaign name (" (GAB)", trailing ".") so the geo /
  // type detection lines up against the canonical tokens.
  const cleaned = stripTrailingAnnotations(name);
  if (!cleaned.startsWith("YH_")) return FALLBACK;

  const parts = cleaned.split("_");
  // Position 0 = "YH", position 1 = network (FB/GG/TT/ASA). Position 2
  // is the channel descriptor: "APP" for app campaigns, "Web" for
  // web-search campaigns.
  const channelDescriptor = parts[2] ?? "";
  const tier = parts[3] ?? "";

  // TIER == "RTG" wins the family marker; otherwise read it from the
  // seasonality token.
  const isRtg = tier === "RTG";

  // Token scan for TYPE / PLATFORM / SEASONALITY. We look at every
  // segment from position 4 onwards so the variable IAP / ALL slots
  // don't matter.
  let type: string | null = null;
  let platform = "";
  let seasonality: string | null = null;

  for (let i = 4; i < parts.length; i++) {
    const p = parts[i];
    if (type == null && TYPE_TOKENS.has(p)) {
      type = p;
      continue;
    }
    if (
      type == null &&
      channelDescriptor !== "APP" &&
      SEARCH_TYPE_TOKENS.has(p)
    ) {
      // Web SRCH campaigns put a keyword tier (Brand / NonBrand) where
      // an APP campaign would have IAP/ALL. We treat Brand/NonBrand
      // as the type when we are in a non-APP channel.
      type = p;
      continue;
    }
    if (
      type == null &&
      channelDescriptor === "APP" &&
      tier === "SRCH" &&
      SEARCH_TYPE_TOKENS.has(p)
    ) {
      // ASA campaigns: YH_ASA_APP_SRCH_<TYPE>_<PLAT>_<GEO>. The TYPE
      // slot reuses the search-keyword vocabulary.
      type = p;
      continue;
    }
    if (
      type == null &&
      channelDescriptor === "APP" &&
      tier === "SRCH" &&
      p.startsWith("Archetype-")
    ) {
      // Archetype-Horror / Archetype-Manga / etc.
      type = p;
      continue;
    }
    if (platform === "" && PLATFORM_TOKENS.has(p)) {
      platform = p;
      continue;
    }
    if (seasonality == null && SEASONALITY_TOKENS.has(p)) {
      seasonality = p;
      continue;
    }
  }

  // Geo = the last segment, unless it doesn't look like a geo, in
  // which case we walk back until we find one. For names with no
  // recognizable geo we leave it as the raw last segment.
  let geo = parts[parts.length - 1] ?? "";
  if (parts.length > 1 && !geoLikelihood(geo) && platform !== "") {
    // Walk back through trailing segments. Stop at the platform token
    // (anything beyond is not a geo).
    for (let i = parts.length - 1; i >= 4; i--) {
      if (parts[i] === platform) break;
      if (geoLikelihood(parts[i])) {
        geo = parts[i];
        break;
      }
    }
  }

  // Decide the family + campaignType.
  let family: string;
  let campaignType: string;

  if (isRtg && type != null) {
    family = `${type} RTG`;
    campaignType = "RTG";
  } else if (type != null && seasonality != null) {
    family = `${type} ${seasonality}`;
    campaignType = seasonality;
  } else if (type != null) {
    // Search-keyword campaigns (Brand / Generic / Competitor) with no
    // seasonality slot. Use the type as the family.
    family = type;
    campaignType = type;
  } else {
    return FALLBACK;
  }

  return { family, geo, campaignType, platform };
}

/**
 * Convenience: classify a single BQ CampaignRow and project the
 * enrichment fields. Used by getReadyData() to widen the campaigns
 * array into EnrichedCampaignRow.
 */
export function enrichCampaignRow(
  row: CampaignRow,
): CampaignRow & CampaignClassification {
  return { ...row, ...classifyCampaignName(row.campaign_name) };
}

// ── helpers ────────────────────────────────────────────────────────────

function stripTrailingAnnotations(name: string): string {
  // " (GAB)" / " (old campaign)" — drop everything from the first
  // space outward. Also trim a trailing period.
  let out = name;
  const space = out.indexOf(" ");
  if (space > 0) out = out.slice(0, space);
  if (out.endsWith(".")) out = out.slice(0, -1);
  return out;
}

function geoLikelihood(token: string): boolean {
  if (!token) return false;
  return KNOWN_GEO_PATTERNS.some((re) => re.test(token));
}
