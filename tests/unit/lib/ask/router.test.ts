// Layer 2 (backend lib unit). File under test: src/lib/ask/router.ts. Priority: P1.
// Exhaustive intent coverage. NL questions in plain English route to one of
// kpi / line / bar / table answers based on regex heuristics. Tests double as
// living documentation of what each prompt resolves to.
import { describe, expect, it, vi } from "vitest";

import { askLumen, inferWindow } from "@/lib/ask/router";

beforeEach(() => {
  // Mock the random 700-1300ms "thinking" delay so the suite stays fast.
  vi.spyOn(Math, "random").mockReturnValue(0);
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function run(q: string, filters?: { windowDays: number }) {
  const p = askLumen(q, filters);
  await vi.advanceTimersByTimeAsync(2000);
  return p;
}

describe("inferWindow", () => {
  it.each([
    ["last 7 days", undefined, 7],
    ["past 14 days", undefined, 14],
    ["this week", undefined, 7],
    ["last week", undefined, 7],
    ["this month", undefined, 30],
    ["this quarter", undefined, 90],
    ["just a generic question", { windowDays: 14 }, 14],
    ["just a generic question", undefined, 30],
  ])("'%s' -> %s days", (q, filters, expected) => {
    expect(inferWindow(filters, q)).toBe(expected);
  });

  it("clamps explicit ranges to [1, 90]", () => {
    expect(inferWindow(undefined, "last 0 days")).toBe(1);
    expect(inferWindow(undefined, "last 365 days")).toBe(90);
  });
});

describe("askLumen: intent routing", () => {
  it("top-N phrasing -> table answer", async () => {
    const ans = await run("top 5 campaigns by spend");
    expect(ans.config.kind).toBe("table");
  });

  it("'best' phrasing -> table answer", async () => {
    const ans = await run("best campaigns last week");
    expect(ans.config.kind).toBe("table");
  });

  it("'by channel' phrasing -> bar answer", async () => {
    const ans = await run("ROAS by channel last 14 days");
    expect(ans.config.kind).toBe("bar");
  });

  it("'compare' phrasing -> bar answer", async () => {
    const ans = await run("compare CPI across networks");
    expect(ans.config.kind).toBe("bar");
  });

  it("'trend' phrasing -> line answer", async () => {
    const ans = await run("spend trend over the last 30 days");
    expect(ans.config.kind).toBe("line");
  });

  it("channel-named without other directive -> line answer scoped to channel", async () => {
    const ans = await run("how is meta doing");
    expect(ans.config.kind).toBe("line");
    if (ans.config.kind === "line") {
      expect(ans.config.metric).toMatch(/Meta/);
    }
  });

  it("plain metric question -> kpi answer", async () => {
    const ans = await run("what is our spend");
    expect(ans.config.kind).toBe("kpi");
  });

  it("Hebrew-free detection: uses the literal English alias 'cost' as spend", async () => {
    const ans = await run("how much cost did we have");
    expect(ans.config.kind).toBe("kpi");
    if (ans.config.kind === "kpi") {
      expect(ans.config.metric).toBe("Spend");
    }
  });
});

describe("askLumen: metric detection", () => {
  it.each([
    ["what is our roas", "ROAS"],
    ["show cpi", "CPI"],
    ["how many installs", "Installs"],
    ["total revenue", "Revenue"],
    ["spend this week", "Spend"],
  ])("'%s' -> %s", async (q, expectedLabel) => {
    const ans = await run(q);
    if (ans.config.kind === "kpi") {
      expect(ans.config.metric).toBe(expectedLabel);
    } else if (ans.config.kind === "line") {
      expect(ans.config.metric).toContain(expectedLabel);
    }
  });
});

describe("askLumen: byline", () => {
  it("attributes every answer to an agent (defaults to Aria)", async () => {
    const ans = await run("top 5 campaigns");
    expect(ans.answeredBy).toBe("aria");
  });
});
