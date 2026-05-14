// Layer 2 (frontend lib unit). File under test: src/lib/dashboard/status.ts.
// Priority: P0.
// The network table's status pill is the dashboard's at-a-glance signal of
// "is this network getting more expensive than the recent past?". Threshold
// drift here is silently misleading — a 1.5× pill flipping to "on track"
// would put real spend at risk.
import { describe, expect, it } from "vitest";

import {
  STATUS_COLOR_VAR,
  STATUS_LABEL,
  statusFromCpaD7,
} from "@/lib/dashboard/status";

describe("statusFromCpaD7 thresholds", () => {
  it("renders 'ok' when the current CPA is at or below 1.2× the trailing baseline", () => {
    expect(statusFromCpaD7(0.5, 1)).toBe("ok");
    expect(statusFromCpaD7(1.0, 1)).toBe("ok");
    expect(statusFromCpaD7(1.2, 1)).toBe("ok"); // edge — inclusive
  });

  it("renders 'warn' just above the 1.2× edge and at the 1.5× edge", () => {
    expect(statusFromCpaD7(1.21, 1)).toBe("warn");
    expect(statusFromCpaD7(1.5, 1)).toBe("warn"); // edge — inclusive
  });

  it("renders 'bad' anywhere above 1.5×", () => {
    expect(statusFromCpaD7(1.51, 1)).toBe("bad");
    expect(statusFromCpaD7(5, 1)).toBe("bad");
  });

  it("renders 'warn' when there is no trailing baseline (avg <= 0)", () => {
    // Network with no matured trailing window — the row should still
    // render but the pill should hedge, not optimistically call it ok.
    expect(statusFromCpaD7(2, 0)).toBe("warn");
    expect(statusFromCpaD7(2, -1)).toBe("warn");
  });

  it("renders 'warn' when the current period has no cohort yet", () => {
    expect(statusFromCpaD7(0, 1)).toBe("warn");
  });
});

describe("status label + color maps", () => {
  it("exposes a human label per status", () => {
    expect(STATUS_LABEL.ok).toBe("On track");
    expect(STATUS_LABEL.warn).toBe("Getting expensive");
    expect(STATUS_LABEL.bad).toBe("Above threshold");
  });

  it("uses the brand accents (mint / yellow / coral) by status", () => {
    expect(STATUS_COLOR_VAR.ok).toMatch(/--color-ua/);
    expect(STATUS_COLOR_VAR.warn).toMatch(/--color-yellow/);
    expect(STATUS_COLOR_VAR.bad).toMatch(/--color-creative/);
  });
});
