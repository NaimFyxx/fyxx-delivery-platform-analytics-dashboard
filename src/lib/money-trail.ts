/**
 * The money trail: the single source of truth for every aggregate money figure in the app.
 *
 * Overview, Insights, Financials and the executive report all render this function's output rather
 * than recomputing anything. That is the whole point: sharing helpers (cogsFor, exVat) was not
 * enough, because each surface called them itself and could pass different arguments (commit
 * 9e01335). Here there is exactly one computation, so the surfaces cannot disagree on the result.
 *
 * A single month and a multi-month range are the same call with a longer `months` array. Range
 * figures sum the additive components and derive the three ratios (net margin, product margin, AOV)
 * once from the summed totals, never by averaging months, so a range equals the sum of its months.
 *
 * Read-only. Reuses cogsFor (alias-resolved, versioned costs) and exVat. It does not change any VAT,
 * margin or COGS formula, only where they are computed. Per-item detail (aggregateItems) is a
 * different granularity and stays separate; data-health check 9 asserts it reconciles to trail.cogs.
 */
import { exVat, type Platform } from "./fyxx";
import { cogsFor, type CostRow, type DbAliasMap } from "./costs";

export interface MoneyTrail {
  months: string[]; // months covered (one for a single month, N for a range)
  platforms: Platform[]; // the platform set covered
  gross: number; // incl VAT
  discounts: number; // partner-funded promos
  netSales: number; // gross - discounts (NSV)
  netSalesExVat: number; // exVat(netSales)
  commFees: number; // netSales - payout (commissions and fees)
  payout: number; // actual payout received (incl VAT)
  vat: number; // payout - payoutExVat
  payoutExVat: number; // exVat(payout)
  grossExVat: number; // exVat(gross)
  cogs: number; // ex-VAT cost of goods, alias-resolved, versioned
  netProfit: number; // payoutExVat - cogs
  netMargin: number; // netProfit / payoutExVat        (fraction 0..1)
  productMargin: number; // (grossExVat - cogs) / grossExVat        (fraction 0..1)
  commMargin: number; // margin on (payout + discounts) ex-VAT: the "after commission" trend line
  orders: number;
  aov: number; // gross / orders
}

/** Structural subset of DashboardData that the money trail needs. Any caller can supply it. */
export interface MoneyTrailInput {
  financials: { month: string; platform: string; gross: number; payout: number; discount: number }[];
  itemSales: { month: string; platform: string; item: string; units: number }[];
  costs: CostRow[];
  daily: { date: string; platform: string; sales: number; orders: number | null }[];
  itemAliases: DbAliasMap; // required, so the trail can never be alias-blind
}

const monthOf = (isoDate: string) => isoDate.slice(0, 7);

/**
 * Gross per platform-month, incl VAT: monthly_financials gross when present, falling back to summed
 * daily_sales only when there is no financials gross for that platform-month. This is the rule the
 * Overview and the report already use, so completed months (which always have financials) are
 * unaffected; the fallback only ever covers an in-progress or not-yet-imported month.
 */
function platformMonthGross(input: MoneyTrailInput, month: string, platform: string): number {
  const finGross = input.financials
    .filter((f) => f.month === month && f.platform === platform)
    .reduce((s, f) => s + f.gross, 0);
  if (finGross > 0) return finGross;
  return input.daily
    .filter((d) => monthOf(d.date) === month && d.platform === platform)
    .reduce((s, d) => s + d.sales, 0);
}

/** The complete money trail for a set of months and platforms. Single month or range, same call. */
export function moneyTrail(input: MoneyTrailInput, months: string[], platforms: Platform[]): MoneyTrail {
  let gross = 0;
  let payout = 0;
  let discounts = 0;
  let orders = 0;
  for (const p of platforms) {
    for (const m of months) {
      gross += platformMonthGross(input, m, p);
      const fin = input.financials.filter((f) => f.month === m && f.platform === p);
      payout += fin.reduce((s, f) => s + f.payout, 0);
      discounts += fin.reduce((s, f) => s + f.discount, 0);
      orders += input.daily
        .filter((d) => monthOf(d.date) === m && d.platform === p)
        .reduce((s, d) => s + (d.orders ?? 0), 0);
    }
  }
  // COGS is summed per month at the cost version in effect for that month (cogsFor's own rule).
  let cogs = 0;
  for (const m of months) cogs += cogsFor(input.itemSales, input.costs, m, platforms, input.itemAliases);

  const netSales = gross - discounts;
  const netSalesExVat = exVat(netSales);
  const commFees = netSales - payout;
  const payoutExVat = exVat(payout);
  const vat = payout - payoutExVat;
  const grossExVat = exVat(gross);
  const netProfit = payoutExVat - cogs;
  const netMargin = payoutExVat > 0 ? netProfit / payoutExVat : 0;
  const productMargin = grossExVat > 0 ? (grossExVat - cogs) / grossExVat : 0;
  const commRevExVat = exVat(payout + discounts);
  const commMargin = commRevExVat > 0 ? (commRevExVat - cogs) / commRevExVat : 0;
  const aov = orders > 0 ? gross / orders : 0;

  return {
    months: [...months],
    platforms: [...platforms],
    gross,
    discounts,
    netSales,
    netSalesExVat,
    commFees,
    payout,
    vat,
    payoutExVat,
    grossExVat,
    cogs,
    netProfit,
    netMargin,
    productMargin,
    commMargin,
    orders,
    aov,
  };
}

/** One MoneyTrail per month (for trend charts and per-row tables). */
export function moneyTrailPerMonth(input: MoneyTrailInput, months: string[], platforms: Platform[]): MoneyTrail[] {
  return months.map((m) => moneyTrail(input, [m], platforms));
}
