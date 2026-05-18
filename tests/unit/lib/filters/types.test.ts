// Layer 2 (lib unit). File under test: src/lib/filters/types.ts.

import { describe, expect, it } from "vitest";

import {
  ALL_DASHBOARD_TABS,
  ALL_OS,
  ALL_PLATFORMS,
  isDashboardTab,
  isOsFilter,
  isPlatformFilter,
} from "@/lib/filters/types";

describe("isOsFilter", () => {
  it("accepts the four whitelist values", () => {
    expect(isOsFilter("total")).toBe(true);
    expect(isOsFilter("ios")).toBe(true);
    expect(isOsFilter("android")).toBe(true);
    expect(isOsFilter("web")).toBe(true);
  });

  it("rejects garbage / casing variants / unrelated tokens", () => {
    expect(isOsFilter("desktop")).toBe(false);
    expect(isOsFilter("IOS")).toBe(false); // strict lowercase; caller normalizes
    expect(isOsFilter("")).toBe(false);
    expect(isOsFilter(null)).toBe(false);
    expect(isOsFilter(undefined)).toBe(false);
    expect(isOsFilter(42)).toBe(false);
  });
});

describe("isPlatformFilter", () => {
  it("accepts the five canonical IntentChannel slugs", () => {
    for (const slug of ALL_PLATFORMS) {
      expect(isPlatformFilter(slug)).toBe(true);
    }
  });

  it("rejects unknown / Hermes-style display labels", () => {
    expect(isPlatformFilter("Meta")).toBe(false); // case-sensitive
    expect(isPlatformFilter("facebook")).toBe(false); // legacy alias
    expect(isPlatformFilter("")).toBe(false);
    expect(isPlatformFilter(null)).toBe(false);
  });
});

describe("ALL_OS / ALL_PLATFORMS constants", () => {
  it("ALL_OS covers exactly the four canonical values", () => {
    expect([...ALL_OS]).toEqual(["total", "ios", "android", "web"]);
  });

  it("ALL_PLATFORMS covers exactly the five IntentChannel values", () => {
    expect([...ALL_PLATFORMS]).toEqual([
      "meta",
      "google",
      "tiktok",
      "apple_search_ads",
      "applovin",
    ]);
  });
});

describe("isDashboardTab", () => {
  it("accepts the three canonical tab values", () => {
    expect(isDashboardTab("performance")).toBe(true);
    expect(isDashboardTab("lifecycle")).toBe(true);
    expect(isDashboardTab("attribution")).toBe(true);
  });

  it("rejects unknown / casing / unrelated tokens", () => {
    expect(isDashboardTab("PERFORMANCE")).toBe(false);
    expect(isDashboardTab("dashboard")).toBe(false);
    expect(isDashboardTab("")).toBe(false);
    expect(isDashboardTab(null)).toBe(false);
    expect(isDashboardTab(undefined)).toBe(false);
    expect(isDashboardTab(0)).toBe(false);
  });
});

describe("ALL_DASHBOARD_TABS constant", () => {
  it("covers exactly the three canonical tab values, in default-first order", () => {
    expect([...ALL_DASHBOARD_TABS]).toEqual([
      "performance",
      "lifecycle",
      "attribution",
    ]);
  });
});
