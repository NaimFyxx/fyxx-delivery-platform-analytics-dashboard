import { describe, it, expect } from "vitest";
import { moneyTrail, moneyTrailPerMonth } from "./money-trail";
import { buildFixture, ALL_MONTHS } from "@/test/fixture";
import type { Platform } from "./fyxx";

const BOTH: Platform[] = ["Talabat", "Careem"];
const money2 = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money0 = (n: number) => Math.round(n).toLocaleString("en-US");
const pct1 = (frac: number) => (frac * 100).toFixed(1);

const fx = buildFixture();
const input = fx; // DashboardData is a superset of MoneyTrailInput

describe("money trail: Jan to Aug range (both platforms)", () => {
  const t = moneyTrail(input, ALL_MONTHS, BOTH);
  it("gross 7,415.86", () => expect(money2(t.gross)).toBe("7,415.86"));
  it("discounts 1,436.33", () => expect(money2(t.discounts)).toBe("1,436.33"));
  it("net sales 5,979.53", () => expect(money2(t.netSales)).toBe("5,979.53"));
  it("commissions 1,681.33", () => expect(money2(t.commFees)).toBe("1,681.33"));
  it("payout 4,298.20", () => expect(money2(t.payout)).toBe("4,298.20"));
  it("COGS 2,030.95", () => expect(money2(t.cogs)).toBe("2,030.95"));
  it("net profit 1,674.39", () => expect(money2(t.netProfit)).toBe("1,674.39"));
  it("net margin 45.2%", () => expect(pct1(t.netMargin)).toBe("45.2"));
  it("product margin 68.2%", () => expect(pct1(t.productMargin)).toBe("68.2"));
  it("277 orders", () => expect(t.orders).toBe(277));
  it("AOV 26.77", () => expect(t.aov.toFixed(2)).toBe("26.77"));
});

describe("money trail: per-month COGS", () => {
  const expected: Record<string, string> = {
    "2026-01": "330.67", "2026-02": "226.70", "2026-03": "168.80", "2026-04": "129.13",
    "2026-05": "445.39", "2026-06": "216.52", "2026-07": "234.34", "2026-08": "279.40",
  };
  const perMonth = moneyTrailPerMonth(input, ALL_MONTHS, BOTH);
  for (const t of perMonth) {
    it(`${t.months[0]} COGS ${expected[t.months[0]]}`, () => expect(money2(t.cogs)).toBe(expected[t.months[0]]));
  }
});

describe("money trail: August alone", () => {
  const t = moneyTrail(input, ["2026-08"], BOTH);
  it("gross 1,011.28", () => expect(money2(t.gross)).toBe("1,011.28"));
  it("COGS 279.40", () => expect(money2(t.cogs)).toBe("279.40"));
  it("net profit 317.51", () => expect(money2(t.netProfit)).toBe("317.51"));
  it("net margin 53.2%", () => expect(pct1(t.netMargin)).toBe("53.2"));
  it("product margin 68.0%", () => expect(pct1(t.productMargin)).toBe("68.0"));
});

describe("money trail: platform YTD", () => {
  const tal = moneyTrail(input, ALL_MONTHS, ["Talabat"]);
  const car = moneyTrail(input, ALL_MONTHS, ["Careem"]);
  it("Talabat gross 4,243.45", () => expect(money2(tal.gross)).toBe("4,243.45"));
  it("Talabat net profit 893", () => expect(money0(tal.netProfit)).toBe("893"));
  it("Talabat margin 43.6%", () => expect(pct1(tal.netMargin)).toBe("43.6"));
  it("Careem gross 3,172.41", () => expect(money2(car.gross)).toBe("3,172.41"));
  it("Careem net profit 781", () => expect(money0(car.netProfit)).toBe("781"));
  it("Careem margin 47.1%", () => expect(pct1(car.netMargin)).toBe("47.1"));
});

describe("money trail: range equals the sum of its months (additivity)", () => {
  const range = moneyTrail(input, ALL_MONTHS, BOTH);
  const perMonth = moneyTrailPerMonth(input, ALL_MONTHS, BOTH);
  const summed = (key: "gross" | "discounts" | "payout" | "cogs" | "netProfit" | "orders") =>
    perMonth.reduce((s, t) => s + t[key], 0);
  for (const key of ["gross", "discounts", "payout", "cogs", "netProfit", "orders"] as const) {
    it(`${key} sums`, () => expect(range[key]).toBeCloseTo(summed(key), 6));
  }
});
