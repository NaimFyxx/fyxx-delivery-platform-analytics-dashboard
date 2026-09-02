import { describe, it, expect } from "vitest";
import { moneyTrail } from "./money-trail";
import { aggregateItems } from "./items";
import { buildReportModel } from "./report";
import { runDataHealthChecks } from "./data-health";
import { buildFixture, ALL_MONTHS } from "@/test/fixture";
import type { Platform } from "./fyxx";

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
