import { describe, it, expect } from "vitest";
import type { MoneyTrail } from "./money-trail";
import { METRICS, bestEver, recordStateFor, type MonthPoint } from "./records";

// Minimal trail: every figure zeroed, then override just the fields a test exercises. The records
// logic only reads gross, discounts, netProfit, netMargin and orders.
function mt(over: Partial<MoneyTrail>): MoneyTrail {
  return {
    months: [],
    platforms: [],
    gross: 0,
    discounts: 0,
    netSales: 0,
    netSalesExVat: 0,
    commFees: 0,
    payout: 0,
    vat: 0,
    payoutExVat: 0,
    grossExVat: 0,
    cogs: 0,
    netProfit: 0,
    netMargin: 0,
    productMargin: 0,
    commMargin: 0,
    orders: 0,
    aov: 0,
    ...over,
  };
}

const point = (month: string, over: Partial<MoneyTrail>): MonthPoint => ({ month, trail: mt(over) });
const allClean = () => true;

describe("records: higher-is-better (monthly gross)", () => {
  // Dec is the max; May is second. Oct is a launch artefact (< 5 orders) and must not win even though
  // its gross would. Sep is the in-progress month and cannot hold. All months are clean.
  const points: MonthPoint[] = [
    point("2025-10", { gross: 9999, orders: 3 }), // launch artefact, excluded (rule 1)
    point("2025-12", { gross: 1635.9, orders: 60 }),
    point("2026-05", { gross: 1608.05, orders: 55 }),
    point("2026-08", { gross: 1011.28, orders: 40 }),
    point("2026-09", { gross: 871, orders: 30 }), // partial, excluded (rule 2)
  ];
  const best = bestEver(METRICS.gross, points, { currentMonth: "2026-09", isClean: allClean });

  it("picks the highest eligible month", () => {
    expect(best.recordMonth).toBe("2025-12");
    expect(best.recordValue).toBeCloseTo(1635.9, 2);
  });
  it("names the runner-up it beats", () => {
    expect(best.beatsMonth).toBe("2026-05");
    expect(best.beatsValue).toBeCloseTo(1608.05, 2);
  });
  it("excludes the launch artefact and the partial month", () => {
    expect(best.recordMonth).not.toBe("2025-10");
    expect(best.eligibleMonths).toBe(3); // Dec, May, Aug
  });
});

describe("records: lower-is-better (discount share)", () => {
  // discountShare = discounts / gross. Lower is better, so the record is the LEAST discounting month.
  const points: MonthPoint[] = [
    point("2026-01", { gross: 1000, discounts: 258, orders: 40 }), // 25.8%
    point("2026-07", { gross: 1000, discounts: 130, orders: 40 }), // 13.0%
    point("2026-08", { gross: 1000, discounts: 79, orders: 40 }), //  7.9%  <- best (lowest)
  ];
  const best = bestEver(METRICS.discountShare, points, { currentMonth: "2026-09", isClean: allClean });

  it("picks the lowest share, not the highest", () => {
    expect(best.recordMonth).toBe("2026-08");
    expect(best.recordValue).toBeCloseTo(7.9, 1);
  });
  it("the runner-up is the next-lowest", () => {
    expect(best.beatsMonth).toBe("2026-07");
    expect(best.beatsValue).toBeCloseTo(13.0, 1);
  });
});

describe("records: lower-is-better (commission drag)", () => {
  // Commission drag = (productMargin - netMargin) * 100, in points. Lower is better, so the record is
  // the LEAST drag month. It is a ratio, so the 10-order volume floor applies.
  const points: MonthPoint[] = [
    point("2026-05", { productMargin: 0.5, netMargin: 0.3, orders: 40 }), // 20.0 pts
    point("2026-06", { productMargin: 0.5, netMargin: 0.35, orders: 40 }), // 15.0 pts
    point("2026-08", { productMargin: 0.5, netMargin: 0.4, orders: 40 }), // 10.0 pts  <- best (lowest)
    point("2026-07", { productMargin: 0.5, netMargin: 0.48, orders: 8 }), //  2.0 pts, thin volume, excluded
  ];
  const best = bestEver(METRICS.commissionDrag, points, { currentMonth: "2026-09", isClean: allClean });

  it("picks the lowest drag, and the volume floor rejects the thinner month with even less drag", () => {
    expect(best.recordMonth).toBe("2026-08");
    expect(best.recordValue).toBeCloseTo(10.0, 1);
  });
  it("the runner-up is the next-lowest drag", () => {
    expect(best.beatsMonth).toBe("2026-06");
    expect(best.beatsValue).toBeCloseTo(15.0, 1);
  });
  it("is declared lower-is-better in the registry", () => {
    expect(METRICS.commissionDrag.direction).toBe("lower");
    expect(METRICS.commissionDrag.ratioFloor).toBe(true);
  });
});

describe("records: ratio metrics need a volume floor (rule 3)", () => {
  // A month with a spectacular margin but only 8 orders must not hold a ratio record (floor is 10),
  // while the same 8-order month WOULD win a non-ratio metric (only the 5-order launch floor applies).
  const points: MonthPoint[] = [
    point("2026-03", { netMargin: 0.9, netProfit: 500, orders: 8 }), // 90% margin, thin volume
    point("2026-08", { netMargin: 0.532, netProfit: 317.51, orders: 40 }), // 53.2%, real volume
  ];
  const opts = { currentMonth: "2026-09", isClean: allClean };

  it("excludes the sub-10-order month from the margin record", () => {
    const best = bestEver(METRICS.netMargin, points, opts);
    expect(best.recordMonth).toBe("2026-08");
    expect(best.recordValue).toBeCloseTo(53.2, 1);
  });
  it("but the same month can hold a non-ratio record (only the 5-order launch floor applies)", () => {
    const best = bestEver(METRICS.netProfit, points, opts);
    expect(best.recordMonth).toBe("2026-03"); // 8 orders >= 5, so eligible here
  });
});

describe("records: suppressed and clean (rule 4, defer to health)", () => {
  const points: MonthPoint[] = [
    point("2026-07", { gross: 1200, orders: 40 }),
    point("2026-08", { gross: 1500, orders: 40 }), // would be the record, but flagged
  ];
  // August is health-flagged (not clean), so it is excluded from holding.
  const isClean = (m: string) => m !== "2026-08";
  const best = bestEver(METRICS.gross, points, { currentMonth: "2026-09", isClean });

  it("a flagged month never holds a record", () => {
    expect(best.recordMonth).toBe("2026-07");
  });
  it("viewing a flagged month yields the suppressed state, no claim", () => {
    const { state } = recordStateFor(METRICS.gross, points, {
      currentMonth: "2026-09",
      isClean,
      selectedMonth: "2026-08",
      selectedIsPartial: false,
    });
    expect(state).toBe("suppressed");
  });
});

describe("records: partial month state (rule 2)", () => {
  const points: MonthPoint[] = [
    point("2025-12", { gross: 1635.9, orders: 60 }), // the standing record
    point("2026-09", { gross: 871, orders: 30 }), // in progress
  ];
  const base = { currentMonth: "2026-09", isClean: allClean, selectedMonth: "2026-09", selectedIsPartial: true };

  it("the partial month does not hold the record", () => {
    const { best } = recordStateFor(METRICS.gross, points, base);
    expect(best.recordMonth).toBe("2025-12");
  });
  it("reads 'on track' when the projection would beat the record", () => {
    const { state } = recordStateFor(METRICS.gross, points, { ...base, projectedValue: 2010 });
    expect(state).toBe("on-track");
  });
  it("reads 'none' (reference line only) when the projection falls short", () => {
    const { state } = recordStateFor(METRICS.gross, points, { ...base, projectedValue: 1400 });
    expect(state).toBe("none");
  });
  it("a complete month that holds the record reads 'record'", () => {
    const { state } = recordStateFor(METRICS.gross, points, {
      currentMonth: "2026-09",
      isClean: allClean,
      selectedMonth: "2025-12",
      selectedIsPartial: false,
    });
    expect(state).toBe("record");
  });
});
