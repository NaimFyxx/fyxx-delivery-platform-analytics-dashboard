import { describe, it, expect } from "vitest";
import { moneyTrail } from "./money-trail";
import { aggregateItems } from "./items";
import { buildReportModel } from "./report";
import { runDataHealthChecks } from "./data-health";
import { buildFixture, ALL_MONTHS } from "@/test/fixture";
import type { Platform } from "./fyxx";
import type { DashboardData } from "./dashboard.functions";

const BOTH: Platform[] = ["Talabat", "Careem"];
const fx = buildFixture();
const money2 = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Check 9: Items stays outside the trail by design, so the sum of its per-item COGS must equal the
// trail's COGS. This is the assertion that keeps the two cost paths from drifting.
describe("reconciliation: per-item COGS equals the money trail COGS", () => {
  const itemCogs = (months: string[]) =>
    aggregateItems({ itemSales: fx.itemSales, costs: fx.costs, prices: [], financials: fx.financials, rangeMonths: months, platforms: BOTH, dbAliases: fx.itemAliases })
      .reduce((s, r) => s + r.cogs, 0);
  it("Jan to Aug range", () => expect(itemCogs(ALL_MONTHS)).toBeCloseTo(moneyTrail(fx, ALL_MONTHS, BOTH).cogs, 6));
  for (const m of ALL_MONTHS) {
    it(`${m}`, () => expect(itemCogs([m])).toBeCloseTo(moneyTrail(fx, [m], BOTH).cogs, 6));
  }
});

// Cross-surface: the report renders moneyTrail's output, so its figures equal the trail's. Because
// every surface now calls the one function, they cannot diverge; this pins that for the report.
describe("cross-surface: the report equals the money trail", () => {
  const model = buildReportModel(fx, {}, { now: new Date("2026-09-15T00:00:00Z") })!;
  it("YTD combined gross equals the trail (7,415.86)", () => {
    expect(model.combined.gross).toBe(money2(moneyTrail(fx, ALL_MONTHS, BOTH).gross));
    expect(model.combined.gross).toBe("7,415.86");
  });
  it("YTD net margin 45.2%", () => expect(model.moneyYtdMargin).toBe("45.2%"));
  it("August net profit 318, net margin 53.2%", () => {
    expect(model.kpi.netProfit).toBe("318");
    expect(model.kpi.netMargin).toBe("53.2");
  });
});

// Guards checks 8 (gross source agreement) and 9 (COGS reconciliation), and that data-health does
// not throw now that it calls moneyTrail and aggregateItems.
describe("data health: gross-source (8) and COGS-reconciliation (9) pass on clean data", () => {
  const report = runDataHealthChecks(fx, {}, new Date("2026-09-15T00:00:00Z"));
  const all = report.months.flatMap((m) => m.checks);
  it("every gross-source check passes", () => {
    const c8 = all.filter((c) => c.id === "gross_source");
    expect(c8.length).toBeGreaterThan(0);
    expect(c8.every((c) => c.status === "pass")).toBe(true);
  });
  it("every COGS-reconciliation check passes", () => {
    const c9 = all.filter((c) => c.id === "cogs_reconciliation");
    expect(c9.length).toBe(ALL_MONTHS.length);
    expect(c9.every((c) => c.status === "pass")).toBe(true);
  });
});

// Check 2 (cogs_band) minimum-data gate. Careem sits on a 31.0% COGS median for three months, then a
// fourth month lands at 21.7% (9.3 pts off). Gross is 1,160 (ex-VAT 1,000) so a month's COGS units
// read straight off as its percentage: 310 -> 31.0%, 217 -> 21.7%. Only the target month's order
// count varies, isolating the gate. Mirrors the real Careem August case (21.7% vs a 31% median).
describe("data health check 2: order-count floor gates the COGS band", () => {
  const HIST = ["2026-04", "2026-05", "2026-06"]; // three clean 31.0% months set the median
  const TARGET = "2026-07"; // the 21.7% outlier under test

  // targetOrders null omits the month from lastOrderDates (orders resolve to 0 = unknown sample).
  const mkData = (targetOrders: number | null): DashboardData => {
    const financials: DashboardData["financials"] = [];
    const itemSales: DashboardData["itemSales"] = [];
    const daily: DashboardData["daily"] = [];
    const lastOrderDates: DashboardData["lastOrderDates"] = [];
    const add = (month: string, cogsUnits: number, orders: number | null) => {
      financials.push({ month, platform: "Careem", gross: 1160, payout: 900, discount: 0, cogsManual: 0, adsFee: 0, boostedFee: 0, marketingFees: 0 });
      itemSales.push({ month, platform: "Careem", item: "unit", units: cogsUnits, revenue: 1160 }); // revenue = gross keeps check 1 at 100%
      daily.push({ date: `${month}-15`, platform: "Careem", sales: 1160, orders: orders ?? 1, cplusSales: 0, cplusOrders: 0, cplusAov: 0, cplusCustomers: 0, nonCplusCustomers: 0, proSales: 0, proOrders: 0 });
      if (orders != null) lastOrderDates.push({ platform: "Careem", month, lastDate: `${month}-15`, orders });
    };
    HIST.forEach((m) => add(m, 310, 20)); // 31.0%, comfortably above the floor
    add(TARGET, 217, targetOrders); // 21.7%, 9.3 pts off the 31.0% median
    return {
      paceDaily: [], daily, financials, costs: [{ item: "unit", cost: 1, effective_from: "2025-01-01" }],
      itemSales, targets: [], lastImportAt: "2026-08-31T00:00:00Z", imports: [], customers: [],
      adjustments: [], itemCategories: {}, lastOrderDates, itemAliases: {}, stretchTargets: [],
    };
  };

  const bandFor = (targetOrders: number | null) =>
    runDataHealthChecks(mkData(targetOrders), {}, new Date("2026-09-15T00:00:00Z"))
      .months.find((mo) => mo.month === TARGET)!
      .checks.find((c) => c.id === "cogs_band" && c.scope === "Careem")!;

  it("fires (fail) on Careem's 21.7% vs 31.0% median with 13 orders (the real August case)", () => {
    const c = bandFor(13);
    expect(c.status).toBe("fail");
    expect(c.detail).toContain("21.7%");
    expect(c.detail).toContain("median 31.0%");
    expect(c.detail).toContain("9.3 pts off");
  });

  it("is informational (pass) when the month has fewer than 10 orders", () => {
    const c = bandFor(8);
    expect(c.status).toBe("pass");
    expect(c.detail).toContain("Only 8 order(s)");
    expect(c.detail).toContain("shown for information");
  });

  it("still fires when order data is absent (0 = unknown sample, never silenced)", () => {
    const c = bandFor(null);
    expect(c.status).toBe("fail");
  });
});
