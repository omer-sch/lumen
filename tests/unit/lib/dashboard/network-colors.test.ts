// Layer 2 (lib unit). File under test: src/lib/dashboard/network-colors.ts.
//
// The headline assertion is the all-distinct guard: every canonical
// network must resolve to a unique color, tint, and foreground.
// That test would have caught the AppLovin == Apple-gray collision and
// the CampaignsTable drift (Meta == mint, Google == yellow) that this
// PR consolidates. A future sixth network added without a token will
// fail here before it ships.

import { describe, expect, it } from "vitest";

import {
  CANONICAL_NETWORKS,
  networkColor,
  networkForeground,
  networkLineDashed,
  networkTint,
} from "@/lib/dashboard/network-colors";

describe("networkColor — canonical mapping", () => {
  it("Google resolves to the mint (UA) token", () => {
    expect(networkColor("Google")).toBe("var(--color-ua)");
  });

  it("Meta resolves to the violet (Organic) token", () => {
    expect(networkColor("Meta")).toBe("var(--color-organic)");
  });

  it("TikTok resolves to the coral (Creative) token", () => {
    expect(networkColor("TikTok")).toBe("var(--color-creative)");
  });

  it("AppLovin resolves to the yellow token", () => {
    expect(networkColor("AppLovin")).toBe("var(--color-yellow)");
  });

  it("Apple Search Ads resolves to neutral gray", () => {
    expect(networkColor("Apple Search Ads")).toBe("var(--text-muted)");
  });
});

describe("networkTint — canonical mapping", () => {
  it("Google → soft mint tint", () => {
    expect(networkTint("Google")).toBe("var(--tint-ua-soft)");
  });

  it("Meta → soft violet tint", () => {
    expect(networkTint("Meta")).toBe("var(--tint-organic-soft)");
  });

  it("TikTok → soft coral tint", () => {
    expect(networkTint("TikTok")).toBe("var(--tint-creative-soft)");
  });

  it("AppLovin → soft yellow tint", () => {
    expect(networkTint("AppLovin")).toBe("var(--tint-yellow-soft)");
  });

  it("Apple Search Ads → surface hover (neutral)", () => {
    expect(networkTint("Apple Search Ads")).toBe("var(--surface-hover)");
  });
});

describe("networkForeground — canonical mapping", () => {
  it("Google → mint", () => {
    expect(networkForeground("Google")).toBe("var(--color-ua)");
  });

  it("Meta → violet", () => {
    expect(networkForeground("Meta")).toBe("var(--color-organic)");
  });

  it("TikTok → coral", () => {
    expect(networkForeground("TikTok")).toBe("var(--color-creative)");
  });

  it("AppLovin → yellow", () => {
    expect(networkForeground("AppLovin")).toBe("var(--color-yellow)");
  });

  it("Apple Search Ads → text-secondary on the neutral tint", () => {
    expect(networkForeground("Apple Search Ads")).toBe("var(--text-secondary)");
  });
});

describe("distinctness across canonical networks", () => {
  it("every canonical solid color is distinct from every other", () => {
    assertAllDistinct(CANONICAL_NETWORKS.map(networkColor));
  });

  it("every canonical tint is distinct from every other", () => {
    assertAllDistinct(CANONICAL_NETWORKS.map(networkTint));
  });

  it("every canonical foreground is distinct from every other", () => {
    // Note: Google's solid + foreground are intentionally the same
    // CSS variable (mint pill on mint text would clash, but the pill
    // background is the *tint*, not the solid). What this guards is
    // that no two networks share a foreground — i.e. a Meta pill and
    // a Google pill never read identical.
    assertAllDistinct(CANONICAL_NETWORKS.map(networkForeground));
  });
});

describe("aliases resolve to their canonical network", () => {
  it("Facebook → Meta", () => {
    expect(networkColor("Facebook")).toBe(networkColor("Meta"));
    expect(networkTint("Facebook")).toBe(networkTint("Meta"));
    expect(networkForeground("Facebook")).toBe(networkForeground("Meta"));
  });

  it("Google Ads → Google", () => {
    expect(networkColor("Google Ads")).toBe(networkColor("Google"));
    expect(networkTint("Google Ads")).toBe(networkTint("Google"));
    expect(networkForeground("Google Ads")).toBe(networkForeground("Google"));
  });

  it("Apple → Apple Search Ads", () => {
    expect(networkColor("Apple")).toBe(networkColor("Apple Search Ads"));
    expect(networkTint("Apple")).toBe(networkTint("Apple Search Ads"));
    expect(networkForeground("Apple")).toBe(networkForeground("Apple Search Ads"));
  });
});

describe("unknown networks fall through to the Apple-equivalent neutral", () => {
  it("networkColor falls back to text-muted", () => {
    expect(networkColor("MystereNet")).toBe("var(--text-muted)");
    expect(networkColor("MystereNet")).toBe(networkColor("Apple Search Ads"));
  });

  it("networkTint falls back to surface-hover", () => {
    expect(networkTint("MystereNet")).toBe("var(--surface-hover)");
    expect(networkTint("MystereNet")).toBe(networkTint("Apple Search Ads"));
  });

  it("networkForeground falls back to text-secondary", () => {
    expect(networkForeground("MystereNet")).toBe("var(--text-secondary)");
    expect(networkForeground("MystereNet")).toBe(networkForeground("Apple Search Ads"));
  });
});

describe("networkLineDashed", () => {
  it("returns true for Apple Search Ads (and its alias)", () => {
    expect(networkLineDashed("Apple Search Ads")).toBe(true);
    expect(networkLineDashed("Apple")).toBe(true);
  });

  it("returns false for every other canonical network", () => {
    expect(networkLineDashed("Google")).toBe(false);
    expect(networkLineDashed("Meta")).toBe(false);
    expect(networkLineDashed("TikTok")).toBe(false);
    expect(networkLineDashed("AppLovin")).toBe(false);
  });

  it("returns false for unknown networks", () => {
    expect(networkLineDashed("MystereNet")).toBe(false);
  });
});

function assertAllDistinct(values: string[]): void {
  for (let i = 0; i < values.length; i++) {
    for (let j = i + 1; j < values.length; j++) {
      expect(
        values[i],
        `expected distinct values at ${i} and ${j}, both were "${values[i]}"`,
      ).not.toBe(values[j]);
    }
  }
}
