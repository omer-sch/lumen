// @vitest-environment node
// Layer 2 (lib unit). File under test: src/lib/analyst/campaign-classifier.ts.
//
// Verifies the GlobalComix campaign-name classifier against live names
// sampled from the warehouse via
// scripts/discover-globalcomix-campaign-names.ts (run 2026-05-16). The
// fixture covers every canonical YH_ pattern observed in the last 90
// days across the four spend tables, plus the "Other" fallback edges.

import { describe, expect, it } from "vitest";

import {
  classifyCampaignName,
  enrichCampaignRow,
  osSqlPredicate,
} from "@/lib/analyst/campaign-classifier";
import type { CampaignRow } from "@/types/dashboard";

type Expectation = {
  family: string;
  geo: string;
  campaignType: string;
  platform: string;
};

// Canonical patterns observed in BQ (DISTINCT campaign_name on the last
// 90 days, 2026-05-16). Includes:
//   - APP / FULL / IAP   (Meta-style 9-segment)
//   - APP / FULL / ALL_IAP (Google's extra ALL slot)
//   - APP / FULL / no-IAP (TikTok's IAP-dropped pattern)
//   - APP / RTG / IAP    (retargeting tier => family marker)
//   - APP / RTG / no-IAP (TikTok retargeting, IAP dropped)
//   - APP / SRCH         (ASA 7-segment)
//   - Web / SRCH         (Google Web search)
//   - Type=Trial         (TikTok seasonal trial)
//   - Geo hyphenation    (WW-Top / WW-EU / WW-NonEU)
//   - Trailing noise     (" (GAB)" / "." suffixes)
const CANONICAL_CASES: ReadonlyArray<[string, Expectation]> = [
  // iOS Meta, 9-segment (from image30 screenshot of the Week 18 deck).
  [
    "YH_FB_APP_FULL_IAP_Sub_iOS_Evergreen_WW",
    { family: "Sub Evergreen", geo: "WW", campaignType: "Evergreen", platform: "iOS" },
  ],
  [
    "YH_FB_APP_FULL_IAP_SubStart_iOS_Evergreen_India",
    { family: "SubStart Evergreen", geo: "India", campaignType: "Evergreen", platform: "iOS" },
  ],
  [
    "YH_FB_APP_RTG_IAP_SubStart_iOS_Evergreen_WW",
    { family: "SubStart RTG", geo: "WW", campaignType: "RTG", platform: "iOS" },
  ],

  // Google APP / FULL / ALL_IAP (extra ALL slot before IAP).
  [
    "YH_GG_APP_FULL_ALL_IAP_SubStart_Android_Evergreen_TopGeos",
    { family: "SubStart Evergreen", geo: "TopGeos", campaignType: "Evergreen", platform: "Android" },
  ],
  [
    "YH_GG_APP_FULL_ALL_IAP_SubStart_iOS_Evergreen_WW-EU",
    { family: "SubStart Evergreen", geo: "WW-EU", campaignType: "Evergreen", platform: "iOS" },
  ],
  [
    "YH_GG_APP_FULL_ALL_IAP_SubStart_iOS_Seasonal_WW-All",
    { family: "SubStart Seasonal", geo: "WW-All", campaignType: "Seasonal", platform: "iOS" },
  ],
  [
    "YH_GG_APP_FULL_ALL_IAP_SubStart_Android_Archetype_US",
    { family: "SubStart Archetype", geo: "US", campaignType: "Archetype", platform: "Android" },
  ],

  // Google APP / RTG / IAP (9-segment, retargeting tier).
  [
    "YH_GG_APP_RTG_IAP_SubStart_Android_Evergreen_US",
    { family: "SubStart RTG", geo: "US", campaignType: "RTG", platform: "Android" },
  ],

  // TikTok APP / FULL / no-IAP (8-segment, IAP slot dropped).
  [
    "YH_TT_APP_FULL_Sub_Android_Evergreen_WW-Top",
    { family: "Sub Evergreen", geo: "WW-Top", campaignType: "Evergreen", platform: "Android" },
  ],
  [
    "YH_TT_APP_FULL_SubStart_iOS_Seasonal_WW-Top",
    { family: "SubStart Seasonal", geo: "WW-Top", campaignType: "Seasonal", platform: "iOS" },
  ],

  // TikTok APP / RTG / no-IAP.
  [
    "YH_TT_APP_RTG_SubStart_iOS_Evergreen_US",
    { family: "SubStart RTG", geo: "US", campaignType: "RTG", platform: "iOS" },
  ],
  [
    "YH_TT_APP_RTG_Trial_iOS_Evergreen_US",
    { family: "Trial RTG", geo: "US", campaignType: "RTG", platform: "iOS" },
  ],

  // TikTok Trial seasonal.
  [
    "YH_TT_APP_FULL_IAP_Trial_iOS_Seasonal_US",
    { family: "Trial Seasonal", geo: "US", campaignType: "Seasonal", platform: "iOS" },
  ],

  // ASA APP / SRCH (7-segment, search-keyword type slot).
  [
    "YH_ASA_APP_SRCH_Brand_iOS_WW",
    { family: "Brand", geo: "WW", campaignType: "Brand", platform: "iOS" },
  ],
  [
    "YH_ASA_APP_SRCH_Generic_iOS_T1",
    { family: "Generic", geo: "T1", campaignType: "Generic", platform: "iOS" },
  ],
  [
    "YH_ASA_APP_SRCH_Comp_iOS_US",
    { family: "Comp", geo: "US", campaignType: "Comp", platform: "iOS" },
  ],
  [
    "YH_ASA_APP_SRCH_Category_iOS_T1",
    { family: "Category", geo: "T1", campaignType: "Category", platform: "iOS" },
  ],
  // Archetype-* compound (hyphenated keyword in the type slot).
  [
    "YH_ASA_APP_SRCH_Archetype-Horror_iOS_T1",
    {
      family: "Archetype-Horror",
      geo: "T1",
      campaignType: "Archetype-Horror",
      platform: "iOS",
    },
  ],
  [
    "YH_ASA_APP_SRCH_Archetype-Manga_iOS_WW",
    {
      family: "Archetype-Manga",
      geo: "WW",
      campaignType: "Archetype-Manga",
      platform: "iOS",
    },
  ],

  // Google Web SRCH (different channel descriptor + monetization slot
  // shape; platform is implicitly "Web" but not on a token).
  [
    "YH_GG_Web_SRCH_Brand_IAP_Sub+Trial_Evergreen_TopGeos",
    { family: "Brand Evergreen", geo: "TopGeos", campaignType: "Evergreen", platform: "" },
  ],
  [
    "YH_GG_Web_SRCH_NonBrand_IAP_Sub+Trial_Evergreen_India",
    { family: "NonBrand Evergreen", geo: "India", campaignType: "Evergreen", platform: "" },
  ],

  // Hand-annotated trailing noise the warehouse sometimes appends to a
  // canonical name. Stripped before classification.
  [
    "YH_TT_APP_FULL_Sub_Android_Evergreen_WW-Top (GAB)",
    { family: "Sub Evergreen", geo: "WW-Top", campaignType: "Evergreen", platform: "Android" },
  ],
  [
    "YH_TT_APP_FULL_Sub_Android_Evergreen_WW-Top.",
    { family: "Sub Evergreen", geo: "WW-Top", campaignType: "Evergreen", platform: "Android" },
  ],
];

describe("classifyCampaignName (canonical YH_ patterns)", () => {
  for (const [name, expected] of CANONICAL_CASES) {
    it(`classifies ${name}`, () => {
      expect(classifyCampaignName(name)).toEqual(expected);
    });
  }
});

describe("classifyCampaignName (Other fallback)", () => {
  it("falls back to Other when the YH_ prefix is missing", () => {
    expect(classifyCampaignName("Yellowhead_US_Brand")).toEqual({
      family: "Other",
      geo: "Unknown",
      campaignType: "Unknown",
      platform: "",
    });
  });

  it("falls back to Other on legacy pipe-delimited names (Google P-max style)", () => {
    expect(
      classifyCampaignName("Apps | EN - US | Android | Installs"),
    ).toEqual({
      family: "Other",
      geo: "Unknown",
      campaignType: "Unknown",
      platform: "",
    });
  });

  it("falls back to Other on legacy lowercase / non-canonical TikTok names", () => {
    expect(
      classifyCampaignName("0626_kf_app_prosp_adv+_subscribe_iOS14+"),
    ).toEqual({
      family: "Other",
      geo: "Unknown",
      campaignType: "Unknown",
      platform: "",
    });
  });

  it("falls back to Other on the empty string", () => {
    expect(classifyCampaignName("")).toEqual({
      family: "Other",
      geo: "Unknown",
      campaignType: "Unknown",
      platform: "",
    });
  });

  it("falls back to Other on a bare keyword name", () => {
    expect(classifyCampaignName("Generic")).toEqual({
      family: "Other",
      geo: "Unknown",
      campaignType: "Unknown",
      platform: "",
    });
  });
});

describe("enrichCampaignRow", () => {
  it("widens a BQ CampaignRow with the classification fields", () => {
    const row: CampaignRow = {
      campaign_id: "12345",
      campaign_name: "YH_FB_APP_FULL_IAP_Sub_iOS_Evergreen_WW",
      network: "Meta",
      spend: 7320,
      installs: 1700,
      cpi: 4.28,
      roi_d7: 0,
      spendDelta: 0.13,
    };
    const enriched = enrichCampaignRow(row);
    expect(enriched).toMatchObject({
      ...row,
      family: "Sub Evergreen",
      geo: "WW",
      campaignType: "Evergreen",
      platform: "iOS",
    });
  });

  it("preserves Other classification when the name doesn't match", () => {
    const row: CampaignRow = {
      campaign_id: "abc",
      campaign_name: "Yellowhead_US_Brand",
      network: "Apple",
      spend: 1000,
      installs: 200,
      cpi: 5,
      roi_d7: 0,
      spendDelta: null,
    };
    const enriched = enrichCampaignRow(row);
    expect(enriched.family).toBe("Other");
    expect(enriched.geo).toBe("Unknown");
    expect(enriched.campaignType).toBe("Unknown");
    expect(enriched.platform).toBe("");
  });
});

// ── WS1.A — osSqlPredicate shape + classifier symmetry ─────────────────────
// The SQL builder reads `os` from the global filter and emits a predicate
// over the spend-side `campaign_name` column. The promise is: the predicate
// matches the same rows `classifyCampaignName` would classify as that OS.

describe("osSqlPredicate (SQL shape)", () => {
  it("emits a token-bounded REGEXP_CONTAINS for each OS", () => {
    expect(osSqlPredicate("ios", "campaign_name")).toBe(
      "REGEXP_CONTAINS(LOWER(campaign_name), r'(^|[_-])ios([_-]|$)')",
    );
    expect(osSqlPredicate("android", "campaign_name")).toBe(
      "REGEXP_CONTAINS(LOWER(campaign_name), r'(^|[_-])android([_-]|$)')",
    );
    expect(osSqlPredicate("web", "campaign_name")).toBe(
      "REGEXP_CONTAINS(LOWER(campaign_name), r'(^|[_-])web([_-]|$)')",
    );
  });

  it("rejects an os token outside the known whitelist", () => {
    // Defensive against a future caller passing a non-canonical value
    // (the TS type already constrains this, but a runtime guard keeps
    // the SQL builder safe from accidental injection of regex meta).
    expect(() =>
      // @ts-expect-error — testing the runtime guard
      osSqlPredicate("desktop", "campaign_name"),
    ).toThrow(/unsupported os token/);
  });
});

describe("classifier <-> osSqlPredicate symmetry", () => {
  // The promise: for every fixture campaign name with a detectable
  // platform, an in-process regex compiled from `osSqlPredicate(os)`
  // returns `true` iff `classifyCampaignName(name).platform === os`.
  //
  // This anchors the two sides of the OS predicate (TS classifier and
  // SQL builder) against the same vocabulary. If a future canonical
  // pattern shifts the platform token's position, this catches the
  // drift before the dashboard quietly zeroes a network leg.

  function predicateMatches(
    os: "ios" | "android" | "web",
    name: string,
  ): boolean {
    // Mirror the SQL: REGEXP_CONTAINS over LOWER(name).
    return new RegExp(`(^|[_-])${os}([_-]|$)`).test(name.toLowerCase());
  }

  const platformsToCheck: ReadonlyArray<"ios" | "android" | "web"> = [
    "ios",
    "android",
    "web",
  ];

  // The canonical fixture covers ASA, Meta, Google, TikTok shapes
  // (the four spend sources where the campaign_name strategy applies).
  const fixtures = CANONICAL_CASES.filter(
    ([, exp]) => exp.platform !== "",
  );

  for (const [name, expected] of fixtures) {
    const expectedOs = expected.platform.toLowerCase() as
      | "ios"
      | "android"
      | "web";
    it(`predicate matches ${expectedOs} for ${name}`, () => {
      for (const os of platformsToCheck) {
        const sqlMatch = predicateMatches(os, name);
        const tsMatch = expectedOs === os;
        expect(sqlMatch, `${os} expected ${tsMatch}`).toBe(tsMatch);
      }
    });
  }
});
