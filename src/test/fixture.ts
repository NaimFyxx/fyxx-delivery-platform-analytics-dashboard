/**
 * Golden fixture: a synthetic DashboardData constructed so the money trail reproduces the exact
 * figures the app shows for January to August 2026. Cells are chosen to satisfy every target
 * simultaneously (range totals, per-month COGS, August, and per-platform YTD). COGS is modelled as
 * one item costing 1.00 ex-VAT, so a row's `units` IS its COGS, giving exact control.
 *
 * Note on the two provided platform net-profit figures: Talabat 893.34 and Careem 781.06 sum to
 * 1,674.40, but the range net profit is 1,674.39, so the two cannot both be exact to the cent at
 * once. This fixture makes the range, per-month and August figures exact to 0.01, and the platform
 * figures exact to the whole JOD (893 / 781) and to 0.1% margin.
 */
import type { DashboardData } from "@/lib/dashboard.functions";

const MONTHS = [
  "2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08",
] as const;

// Verified per-month COGS (both platforms), sums to 2,030.95.
const COGS: Record<string, number> = {
  "2026-01": 330.67, "2026-02": 226.70, "2026-03": 168.80, "2026-04": 129.13,
  "2026-05": 445.39, "2026-06": 216.52, "2026-07": 234.34, "2026-08": 279.40,
};

// Platform split of COGS chosen so Talabat YTD COGS = 1,153.70 and Careem = 877.25.
const T_COGS_YTD = 1153.7;
const COGS_TOTAL = 2030.95;
const fT = T_COGS_YTD / COGS_TOTAL; // Talabat share of each month's COGS

// Gross (incl VAT): Talabat YTD 4,243.45, Careem 3,172.41, August combined 1,011.28.
const GROSS_AUG_T = 578.6;
const GROSS_AUG_C = 1011.28 - GROSS_AUG_T; // 432.68
const GROSS_OTHER_T = (4243.45 - GROSS_AUG_T) / 7;
const GROSS_OTHER_C = (3172.41 - GROSS_AUG_C) / 7;

// Payout (incl VAT): Talabat YTD 2,374.57, Careem 1,923.63 (sum 4,298.20). August combined 692.4156
// so August payout ex-VAT is 596.91 and August net profit is 596.91 - 279.40 = 317.51.
const PAY_AUG_T = 400.0;
const PAY_AUG_C = 692.4156 - PAY_AUG_T;
const PAY_OTHER_T = (2374.57 - PAY_AUG_T) / 7;
const PAY_OTHER_C = (1923.63 - PAY_AUG_C) / 7;

const DISCOUNT_CELL = 1436.33 / 16; // total discounts 1,436.33, split evenly across 16 cells

// Orders total 277, distributed across the 16 cells as whole numbers.
function ordersFor(index: number): number {
  return 17 + (index < 5 ? 1 : 0); // 5 cells of 18 + 11 of 17 = 277
}

export function buildFixture(): DashboardData {
  const financials: DashboardData["financials"] = [];
  const itemSales: DashboardData["itemSales"] = [];
  const daily: DashboardData["daily"] = [];

  MONTHS.forEach((m, i) => {
    const isAug = m === "2026-08";
    const grossT = isAug ? GROSS_AUG_T : GROSS_OTHER_T;
    const grossC = isAug ? GROSS_AUG_C : GROSS_OTHER_C;
    const payT = isAug ? PAY_AUG_T : PAY_OTHER_T;
    const payC = isAug ? PAY_AUG_C : PAY_OTHER_C;
    const cogsT = COGS[m] * fT;
    const cogsC = COGS[m] * (1 - fT);

    const cell = (platform: "Talabat" | "Careem", gross: number, payout: number, cogs: number, ordersIdx: number) => {
      financials.push({
        month: m, platform, gross, payout, discount: DISCOUNT_CELL,
        cogsManual: 0, adsFee: 0, boostedFee: 0, marketingFees: 0,
      });
      // COGS via one item at cost 1.00: units == COGS contribution.
      itemSales.push({ month: m, platform, item: "unit", units: cogs, revenue: gross });
      daily.push({
        date: `${m}-15`, platform, sales: gross, orders: ordersFor(ordersIdx),
        cplusSales: 0, cplusOrders: 0, cplusAov: 0, cplusCustomers: 0,
        nonCplusCustomers: 0, proSales: 0, proOrders: 0,
      });
    };
    cell("Talabat", grossT, payT, cogsT, i * 2);
    cell("Careem", grossC, payC, cogsC, i * 2 + 1);
  });

  return {
    paceDaily: [],
    daily,
    financials,
    costs: [{ item: "unit", cost: 1, effective_from: "2025-01-01" }],
    itemSales,
    targets: [],
    lastImportAt: "2026-08-31T00:00:00Z",
    imports: [],
    customers: [],
    adjustments: [],
    itemCategories: {},
    lastOrderDates: [],
    itemAliases: {},
  };
}

export const ALL_MONTHS = [...MONTHS];
