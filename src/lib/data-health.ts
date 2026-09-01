/**
 * Data health self-check. Read-only: it reruns figures the dashboard already computes and
 * flags silently-bad data. It never writes. All cost logic is reused from costs.ts (cogsFor,
 * costAsOf, canonicalItemName); margins and VAT reuse exVat. Nothing here reimplements them.
 */
import { exVat } from "./fyxx";
import { cogsFor, costAsOf, canonicalItemName, type DbAliasMap } from "./costs";
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

      // 4. Day coverage (gross / order data only), complete months only.
      if (complete) {
        const last =
          data.lastOrderDates.find((l) => l.month === m && l.platform === p)?.lastDate ?? null;
        if (last) {
          const end = lastDayOfMonth(m);
          const gap = daysBetween(last, end);
          checks.push({
            id: "day_coverage",
            label: "Order-date coverage",
            scope: p,
            status: gap > 2 ? "fail" : "pass",
            detail: `${p} last order ${last}, ${gap} day(s) before month end (${end}). Covers gross and order data only, not item data.`,
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
