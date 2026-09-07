import { describe, it, expect } from "vitest";
import { paceBadgeState, paceBasePct } from "./pace-badge";

// September 2026 combined targets from the spec: base 1,000 (Talabat 590 + Careem 410), stretch 1,150.
const BASE = 1000;
const STRETCH = 1150;

describe("pace badge state", () => {
  it("below base, month in progress -> in_progress", () => {
    expect(paceBadgeState({ totalSales: 248, base: BASE, stretch: STRETCH, complete: false })).toBe("in_progress");
  });

  it("base reached mid-month stays reached (not missed, month not over)", () => {
    expect(paceBadgeState({ totalSales: 1000, base: BASE, stretch: STRETCH, complete: false })).toBe("base_reached");
    // and one JOD above base, still mid-month
    expect(paceBadgeState({ totalSales: 1001, base: BASE, stretch: STRETCH, complete: false })).toBe("base_reached");
  });

  it("stretch reached -> stretch_reached (outranks base)", () => {
    expect(paceBadgeState({ totalSales: 1150, base: BASE, stretch: STRETCH, complete: false })).toBe("stretch_reached");
    expect(paceBadgeState({ totalSales: 1300, base: BASE, stretch: STRETCH, complete: true })).toBe("stretch_reached");
  });

  it("month complete below base -> missed", () => {
    expect(paceBadgeState({ totalSales: 900, base: BASE, stretch: STRETCH, complete: true })).toBe("missed");
  });

  it("base but no stretch: reaching base is base_reached, no stretch state ever", () => {
    expect(paceBadgeState({ totalSales: 1000, base: BASE, stretch: null, complete: false })).toBe("base_reached");
    // far above base with no stretch set stays base_reached, never stretch_reached
    expect(paceBadgeState({ totalSales: 5000, base: BASE, stretch: null, complete: true })).toBe("base_reached");
  });

  it("no base set -> no_target", () => {
    expect(paceBadgeState({ totalSales: 500, base: 0, stretch: null, complete: false })).toBe("no_target");
  });
});

describe("pace percentage is percent of base, not stretch", () => {
  it("248 of base 1,000 is 24.8 percent", () => {
    expect(paceBasePct(248, BASE)).toBeCloseTo(24.8, 6);
  });
  it("1,150 (stretch) of base 1,000 is 115 percent, not 100", () => {
    expect(paceBasePct(1150, BASE)).toBeCloseTo(115, 6);
  });
});
