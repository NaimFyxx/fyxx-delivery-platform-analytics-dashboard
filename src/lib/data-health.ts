/**
 * Data health self-check. Read-only: it reruns figures the dashboard already computes and
 * flags silently-bad data. It never writes. All cost logic is reused from costs.ts (cogsFor,
 * costAsOf, canonicalItemName); margins and VAT reuse exVat. Nothing here reimplements them.
 */
import { exVat } from "./fyxx";
import { cogsFor, costAsOf, canonicalItemName, type DbAliasMap } from "./costs";
import { categoryFor, UNCATEGORISED } from "./categories";
import { moneyTrail } from "./money-trail";
import { aggregateItems } from "./items";
import { lastDayOfMonth, monthOfDate } from "./months";
import type { DashboardData } from "./dashboard.functions";

export type HealthStatus = "pass" | "warn" | "fail";
export interface HealthCheck {
  id: string;
  label: string;
  scope?: string; // e.g. "Careem"
  status: HealthStatus;
  detail: string;
}
export interface MonthHealth {
  month: string;
  complete: boolean;
  status: HealthStatus; // worst of its checks
  checks: HealthCheck[];
}
export interface HealthReport {
  months: MonthHealth[]; // newest first
  overall: HealthStatus;
}

const PLATFORMS = ["Talabat", "Careem"] as const;
type Platform = (typeof PLATFORMS)[number];

// Check 4 sensitivity. The expected spacing between orders is derived from live data
// (days-in-month / orders); these two knobs set how far past that spacing a trailing gap has to
// run before it is worth a glance. Warn-only, never a failure.
const COVERAGE_GAP_FLOOR_DAYS = 4; // a normal few-day tail never fires
const COVERAGE_GAP_MULTIPLE = 3; // gap must exceed 3x the platform's usual spacing

const worst = (a: HealthStatus, b: HealthStatus): HealthStatus =>
  a === "fail" || b === "fail" ? "fail" : a === "warn" || b === "warn" ? "warn" : "pass";
const worstOf = (xs: HealthStatus[]): HealthStatus => xs.reduce(worst, "pass" as HealthStatus);

const money = (n: number) => `${Math.round(n).toLocaleString("en-US")} JOD`;
const pct1 = (n: number) => `${n.toFixed(1)}%`;

function median(arr: number[]): number | null {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);
}

/** Run every data-health check across all months present in the data. */
export function runDataHealthChecks(
  data: DashboardData,
  dbAliases: DbAliasMap,
  now?: Date,
): HealthReport {
  const nowD = now ?? new Date();
  const curCalMonth = `${nowD.getFullYear()}-${String(nowD.getMonth() + 1).padStart(2, "0")}`;

  const months = Array.from(
    new Set([
      ...data.financials.map((f) => f.month),
      ...data.itemSales.map((i) => i.month),
      ...data.daily.map((d) => monthOfDate(d.date)),
    ]),
  ).sort();

  const grossOf = (m: string, p: string) =>
    data.financials
      .filter((f) => f.month === m && f.platform === p)
      .reduce((s, f) => s + f.gross, 0);
  const payoutOf = (m: string, p: string) =>
    data.financials
      .filter((f) => f.month === m && f.platform === p)
      .reduce((s, f) => s + f.payout, 0);
  const dailyGrossOf = (m: string, p: string) =>
    data.daily
      .filter((d) => monthOfDate(d.date) === m && d.platform === p)
      .reduce((s, d) => s + d.sales, 0);
  const itemRevOf = (m: string, p: string) =>
    data.itemSales
      .filter((i) => i.month === m && i.platform === p)
      .reduce((s, i) => s + i.revenue, 0);

  // Per-platform COGS-ratio history (cogs / ex-VAT gross), for the trailing median band in check 2.
  const cogsRatioHist: Record<Platform, number[]> = { Talabat: [], Careem: [] };
  for (const m of months) {
    for (const p of PLATFORMS) {
      const g = grossOf(m, p);
      if (g <= 0) continue;
      cogsRatioHist[p].push(
        (cogsFor(data.itemSales, data.costs, m, [p], dbAliases) / exVat(g)) * 100,
      );
    }
  }
  const cogsMedian: Record<Platform, number | null> = {
    Talabat: median(cogsRatioHist.Talabat),
    Careem: median(cogsRatioHist.Careem),
  };

  const monthHealth: MonthHealth[] = months.map((m) => {
    const complete = m < curCalMonth;
    const checks: HealthCheck[] = [];

    for (const p of PLATFORMS) {
      const gross = grossOf(m, p);
      if (gross <= 0) continue; // platform not active this month

      // 1. Item revenue reconciles to gross.
      const rev = itemRevOf(m, p);
      const ratio = (rev / gross) * 100;
      const s1: HealthStatus =
        ratio >= 95 && ratio <= 105
          ? "pass"
          : (ratio >= 90 && ratio < 95) || (ratio > 105 && ratio <= 110)
            ? "warn"
            : "fail";
      checks.push({
        id: "revenue_reconcile",
        label: "Item revenue vs gross",
        scope: p,
        status: s1,
        detail: `${p} item revenue is ${pct1(ratio)} of gross (${money(rev)} of ${money(gross)}).`,
      });

      // 2. COGS ratio in band vs the platform's trailing median.
      const cogs = cogsFor(data.itemSales, data.costs, m, [p], dbAliases);
      const cr = (cogs / exVat(gross)) * 100;
      const med = cogsMedian[p];
      if (med == null || cogsRatioHist[p].length < 3) {
        checks.push({
          id: "cogs_band",
          label: "COGS ratio in band",
          scope: p,
          status: "pass",
          detail: `${p} COGS is ${pct1(cr)} of ex-VAT gross. Not enough history yet to set a band.`,
        });
      } else {
        const dev = Math.abs(cr - med);
        const s2: HealthStatus = dev > 8 ? "fail" : dev > 5 ? "warn" : "pass";
        checks.push({
          id: "cogs_band",
          label: "COGS ratio in band",
          scope: p,
          status: s2,
          detail: `${p} COGS is ${pct1(cr)} of ex-VAT gross vs median ${pct1(med)} (${dev.toFixed(1)} pts off).`,
        });
      }

      // 6. Commission drag stays positive (product margin >= net margin). Sign-error canary.
      const payout = payoutOf(m, p);
      const grossEx = exVat(gross);
      const payoutEx = exVat(payout);
      if (grossEx > 0 && payoutEx > 0) {
        const prod = ((grossEx - cogs) / grossEx) * 100;
        const net = ((payoutEx - cogs) / payoutEx) * 100;
        const drag = prod - net;
        checks.push({
          id: "drag_positive",
          label: "Commission drag positive",
          scope: p,
          status: drag < 0 ? "fail" : "pass",
          detail:
            drag < 0
              ? `${p} product margin ${pct1(prod)} is below net margin ${pct1(net)} (drag ${drag.toFixed(1)} pts). Payout exceeded gross, which is impossible.`
              : `${p} drag ${drag.toFixed(1)} pts (product ${pct1(prod)}, net ${pct1(net)}).`,
        });
      }

      // 4. Order-date coverage (gross / order data only). Warn-only: a quiet trailing gap is a
      // business fact, not proof of broken data. The threshold scales with the platform's own
      // order frequency for the month, so a thin month loosens automatically. Complete months only.
      if (complete) {
        const lo = data.lastOrderDates.find((l) => l.month === m && l.platform === p);
        if (lo?.lastDate) {
          const end = lastDayOfMonth(m);
          const gap = daysBetween(lo.lastDate, end);
          const daysInMonth = Number(end.slice(-2));
          const orders = lo.orders ?? 0;
          const spacing = orders > 0 ? daysInMonth / orders : daysInMonth;
          const threshold = Math.max(COVERAGE_GAP_FLOOR_DAYS, COVERAGE_GAP_MULTIPLE * spacing);
          const flag = gap > threshold;
          checks.push({
            id: "day_coverage",
            label: "Order-date coverage",
            scope: p,
            status: flag ? "warn" : "pass",
            detail: flag
              ? `${p} last order ${lo.lastDate}, a ${gap} day gap to month end (${end}). At ${orders} order(s) the usual spacing is about ${spacing.toFixed(1)} day(s), so a gap over ${threshold.toFixed(1)} days stands out. Could be a genuine quiet spell rather than missing data. Covers gross and order data only, not item data.`
              : `${p} last order ${lo.lastDate}, a ${gap} day gap to month end (${end}), in line with its ${orders} order(s) this month. Covers gross and order data only, not item data.`,
          });
        }
      }

      // 8. Gross source agreement. The money trail uses monthly_financials gross, falling back to
      // summed daily only when financials is absent. This confirms the fallback is harmless: for a
      // complete month with both sources, they should agree. If they diverge the app shows the
      // financials figure and this names the daily figure it would otherwise have shown.
      if (complete) {
        const day = dailyGrossOf(m, p);
        if (day > 0) {
          const diff = Math.abs(gross - day);
          const rel = gross > 0 ? diff / gross : 1;
          checks.push({
            id: "gross_source",
            label: "Gross source agreement",
            scope: p,
            status: rel > 0.01 ? "warn" : "pass",
            detail:
              rel > 0.01
                ? `${p} financials gross ${money(gross)} vs summed daily ${money(day)} differ by ${money(diff)} (${pct1(rel * 100)}). The app shows the financials figure; the daily fallback would show the other.`
                : `${p} financials gross ${money(gross)} matches summed daily ${money(day)} within 1%.`,
          });
        }
      }
    }

    // 3. Every sold item has a cost (month level, both platforms).
    const unmatched = new Map<string, string>(); // canonical -> display name
    for (const s of data.itemSales) {
      if (s.month !== m || s.units <= 0) continue;
      if (costAsOf(data.costs, s.item, lastDayOfMonth(m), dbAliases) == null) {
        unmatched.set(canonicalItemName(s.item, dbAliases), s.item);
      }
    }
    checks.push({
      id: "items_costed",
      label: "Every sold item has a cost",
      status: unmatched.size ? "fail" : "pass",
      detail: unmatched.size
        ? `${unmatched.size} sold item(s) with no cost, contributing 0 to COGS: ${[...unmatched.values()].join(", ")}.`
        : "All sold items resolve to a cost.",
    });

    // 7. Category coverage (month level). The real failure mode is items landing in Uncategorised
    // because an alias did not resolve or no category is assigned, which silently distorts the
    // category rollup and the report's best-selling-category signal. Report the uncategorised share
    // of item revenue and name the items. Reuses categoryFor + canonicalItemName with dbAliases.
    const rows = data.itemSales.filter((s) => s.month === m);
    const byCat = new Map<string, number>(); // category -> revenue (also feeds the consistency guard)
    const uncat = new Map<string, { name: string; rev: number; units: number }>();
    let itemRev = 0;
    let uncatRev = 0;
    for (const s of rows) {
      itemRev += s.revenue;
      const cat = categoryFor(s.item, data.itemCategories, dbAliases);
      byCat.set(cat, (byCat.get(cat) ?? 0) + s.revenue);
      if (cat === UNCATEGORISED) {
        uncatRev += s.revenue;
        const key = canonicalItemName(s.item, dbAliases);
        const e = uncat.get(key) ?? { name: s.item, rev: 0, units: 0 };
        e.rev += s.revenue;
        e.units += s.units;
        if (s.item.length < e.name.length) e.name = s.item; // prefer the shorter display name
        uncat.set(key, e);
      }
    }
    if (rows.length) {
      const share = itemRev > 0 ? (uncatRev / itemRev) * 100 : 0;
      const n = uncat.size;
      const names = [...uncat.values()]
        .sort((a, b) => b.rev - a.rev)
        .map((u) => `${u.name} (${money(u.rev)}, ${u.units} units)`)
        .join("; ");
      checks.push({
        id: "category_coverage",
        label: "Category coverage",
        status: n === 0 ? "pass" : share > 5 ? "fail" : "warn",
        detail:
          n === 0
            ? "Every sold item resolves to a category."
            : `${n} item(s) uncategorised, ${money(uncatRev)} (${pct1(share)} of item revenue): ${names}.`,
      });

      // Consistency guard (low signal, like check 5): the category rollup sums to the item total.
      // Tautological on current data since categoryFor maps every item to exactly one bucket; kept
      // to catch a future divergent computation or float drift. Not a data check.
      const catTotal = [...byCat.values()].reduce((s, v) => s + v, 0);
      const diff = Math.abs(catTotal - itemRev);
      checks.push({
        id: "category_additivity",
        label: "Category rollup consistency",
        scope: "consistency guard",
        status: diff > 0.01 ? "fail" : "pass",
        detail:
          diff > 0.01
            ? `Category revenue total ${money(catTotal)} does not match item revenue ${money(itemRev)} (off by ${diff.toFixed(2)} JOD).`
            : `Category totals reconcile to item revenue (${money(itemRev)}).`,
      });
    }

    // 9. COGS reconciliation. Items stays outside the money trail by design (per-item granularity),
    // so this is the assertion that keeps it honest: the sum of the per-item COGS the Items page
    // computes (aggregateItems) must equal the trail's COGS for the month. Any gap means the two
    // cost paths have drifted apart, the exact class of bug this refactor is meant to prevent.
    {
      const trailCogs = moneyTrail(data, [m], [...PLATFORMS]).cogs;
      const perItem = aggregateItems({
        itemSales: data.itemSales,
        costs: data.costs,
        prices: [],
        financials: data.financials,
        rangeMonths: [m],
        platforms: [...PLATFORMS],
        dbAliases,
      });
      const itemCogs = perItem.reduce((s, r) => s + r.cogs, 0);
      const cogsDiff = Math.abs(itemCogs - trailCogs);
      checks.push({
        id: "cogs_reconciliation",
        label: "Per-item COGS reconciles to the money trail",
        scope: "consistency guard",
        status: cogsDiff > 0.01 ? "fail" : "pass",
        detail:
          cogsDiff > 0.01
            ? `Items COGS ${money(itemCogs)} does not match the money trail COGS ${money(trailCogs)} (off by ${cogsDiff.toFixed(2)} JOD). The per-item and aggregate cost paths have diverged.`
            : `Per-item COGS sums to the money trail COGS (${money(trailCogs)}).`,
      });
    }

    return { month: m, complete, status: worstOf(checks.map((c) => c.status)), checks };
  });

  monthHealth.reverse(); // newest first
  return { months: monthHealth, overall: worstOf(monthHealth.map((x) => x.status)) };
}

/**
 * Report consistency (check 5). Not a raw-data check: it verifies the executive report's own
 * aggregation, that the YTD column equals the sum of its monthly figures and that combined equals
 * the sum of the platform rows. Any difference above 0.01 JOD is a fail.
 */
export interface ReportConsistencyInput {
  monthlyGross: number[]; // per YTD month
  ytdGross: number;
  talabatYtdGross: number;
  careemYtdGross: number;
  combinedYtdGross: number;
}
export function checkReportConsistency(i: ReportConsistencyInput): HealthCheck {
  const sumMonths = i.monthlyGross.reduce((s, v) => s + v, 0);
  const dMonths = Math.abs(sumMonths - i.ytdGross);
  const dPlat = Math.abs(i.talabatYtdGross + i.careemYtdGross - i.combinedYtdGross);
  const fail = dMonths > 0.01 || dPlat > 0.01;
  return {
    id: "report_additivity",
    label: "Report consistency (YTD and combined add up)",
    status: fail ? "fail" : "pass",
    detail: fail
      ? `Report figures do not add up: monthly sum vs YTD off by ${dMonths.toFixed(2)} JOD, platforms vs combined off by ${dPlat.toFixed(2)} JOD.`
      : "Report YTD equals the sum of its months and combined equals the platform rows.",
  };
}
