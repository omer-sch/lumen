// @vitest-environment jsdom
// Layer 3 (component). File under test:
// src/components/reports/sections/ProseBlock.tsx.
//
// Two render paths matter for survivability:
//   1. The current shape (bullets[] + bottomLine) paints bullets and a
//      yellow bottom-line band.
//   2. An older shape from a pre-bullets save (text + highlights, no
//      bullets) must NOT crash; it renders a "regenerate me"
//      placeholder so the page hydrates cleanly.

import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { ProseBlockView } from "@/components/reports/sections/ProseBlock";
import type { ProseBlock } from "@/lib/reports/types";

describe("ProseBlockView", () => {
  it("renders bullets + bottomLine for the current shape", () => {
    const block: ProseBlock = {
      heading: "Sub Evergreen",
      bullets: [
        { text: "WW campaign delivered strong results", highlights: [] },
        { text: "India held steady", highlights: [] },
      ],
      bottomLine: "Keep WW; revisit India next week.",
    };
    render(<ProseBlockView block={block} />);
    expect(screen.getByText(/Sub Evergreen/i)).toBeTruthy();
    expect(
      screen.getByText(/WW campaign delivered strong results/),
    ).toBeTruthy();
    expect(screen.getByText(/Bottom line/i)).toBeTruthy();
    expect(
      screen.getByText(/Keep WW; revisit India next week./),
    ).toBeTruthy();
  });

  it("renders a regenerate-me placeholder for a legacy block (no bullets array)", () => {
    // Cast: this is exactly the runtime shape that hydrates from old
    // Supabase rows where the prose was stored as `{ text, highlights }`.
    const legacy = {
      heading: "Sub Evergreen",
      text: "Legacy prose text",
      highlights: [],
    } as unknown as ProseBlock;

    render(<ProseBlockView block={legacy} />);
    expect(screen.getByRole("note")).toBeTruthy();
    expect(
      screen.getByText(/older version of Smart Reports/i),
    ).toBeTruthy();
    // The yellow "Bottom line" band is only painted when the new
    // shape's bullets render. The placeholder copy mentions "bottom
    // line" inside a sentence, so assert on the band's display label
    // (uppercase + tracked-out) instead of the generic phrase.
    expect(screen.queryByText("Bottom line")).toBeNull();
    // And the legacy text is not surfaced (the user has to regenerate
    // to see the refreshed copy).
    expect(screen.queryByText("Legacy prose text")).toBeNull();
  });

  it("renders the placeholder when bullets is empty", () => {
    const block: ProseBlock = {
      bullets: [],
      bottomLine: "anything",
    };
    render(<ProseBlockView block={block} />);
    expect(screen.getByRole("note")).toBeTruthy();
  });
});
