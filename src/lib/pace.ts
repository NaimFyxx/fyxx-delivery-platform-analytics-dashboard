/**
 * Pace computation for the current month: cumulative combined sales from the manual pace sheet
 * (paceDaily) against the per-platform base targets and the optional combined stretch. Pure, no
 * React, so the Overview card and the global pace bar/dock both render from one computation.
 * Read-only: it does not change targets, sales, VAT, margins or the importer.
 */
import { monthOfDate } from "./months";
import type { DashboardData } from "./dashboard.functions";

export type PaceData = {
  rows: { platform: "Talabat" | "Careem"; sales: number; target: number; achievement: number }[];
  totalSales: number; totalTarget: number; totalAchievement: number;
  proRated: number; proRatedAch: number;
  dayOfMonth: number; daysInMonth: number; workingDay: number;
  dataThroughLabel: string | null;
  dataThroughStale: boolean;
  perPlatformThrough: { platform: "Talabat" | "Careem"; label: string }[];
  base: number; // combined base target (== totalTarget), named for the base/stretch model
  stretch: number | null; // combined stretch target for the month, or null when not set
};

export function computePace(data: DashboardData, currentMonth: string, today: string): PaceData {
  const dayOfMonth = Number(today.slice(8, 10));
  const [y, mm] = currentMonth.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, mm, 0)).getUTCDate();

  const workingDates = new Set(
    data.paceDaily
      .filter((d) => monthOfDate(d.date) === currentMonth && d.date <= today)
      .map((d) => d.date),
  );
  const workingDay = workingDates.size;

  const platformsOnSheet: ("Talabat" | "Careem")[] = ["Talabat", "Careem"];
  const rows = platformsOnSheet.map((p) => {
    const sales = data.paceDaily
      .filter((d) => monthOfDate(d.date) === currentMonth && d.platform === p)
      .reduce((s, d) => s + d.sales, 0);
    const target = data.targets
      .filter((t) => t.month === currentMonth && t.platform === p)
      .reduce((s, t) => s + t.salesTarget, 0);
    const achievement = target > 0 ? (sales / target) * 100 : 0;
    return { platform: p, sales, target, achievement };
  });

  const totalSales = rows.reduce((s, r) => s + r.sales, 0);
  const totalTarget = rows.reduce((s, r) => s + r.target, 0);
  const totalAchievement = totalTarget > 0 ? (totalSales / totalTarget) * 100 : 0;
  const proRated = totalTarget * (dayOfMonth / daysInMonth);
  const proRatedAch = proRated > 0 ? (totalSales / proRated) * 100 : 0;

  const latestByPlatform = (["Talabat", "Careem"] as const).map((p) => {
    const dates = data.paceDaily
      .filter((d) => monthOfDate(d.date) === currentMonth && d.platform === p)
      .map((d) => d.date);
    return { platform: p, latest: dates.length ? dates.sort().at(-1)! : null };
  }).filter((x) => x.latest !== null) as { platform: "Talabat" | "Careem"; latest: string }[];
  const dataThroughDate = latestByPlatform.length
    ? latestByPlatform.reduce((min, x) => (x.latest < min ? x.latest : min), latestByPlatform[0].latest)
    : null;
  const dataThroughLabel = dataThroughDate
    ? new Date(dataThroughDate + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })
    : null;
  const dataThroughStale = dataThroughDate !== null && dataThroughDate < today;
  const perPlatformThrough = latestByPlatform.map((x) => ({
    platform: x.platform,
    label: new Date(x.latest + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" }),
  }));

  // Combined stretch for this month (optional). Base is the sum of the platform targets (totalTarget).
  const stretch = (data.stretchTargets ?? []).find((s) => s.month === currentMonth)?.stretch ?? null;

  return {
    rows, totalSales, totalTarget, totalAchievement, proRated, proRatedAch,
    dayOfMonth, daysInMonth, workingDay,
    dataThroughLabel, dataThroughStale, perPlatformThrough,
    base: totalTarget, stretch: stretch != null && stretch > 0 ? stretch : null,
  };
}

/** The pace month and as-of date: the current calendar month, holding the finished month for the
 *  first 3 days of a new one so a closed month stays visible while it is being wrapped up. */
export function currentPaceMonth(now: Date = new Date()): { month: string; asOf: string } {
  const today = now.toISOString().slice(0, 10);
  const realMonth = monthOfDate(today);
  const holdPrev = Number(today.slice(8, 10)) <= 3;
  if (!holdPrev) return { month: realMonth, asOf: today };
  const [y, m] = realMonth.split("-").map(Number);
  const prev = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  const [py, pm] = prev.split("-").map(Number);
  const lastDay = new Date(Date.UTC(py, pm, 0)).getUTCDate();
  return { month: prev, asOf: `${prev}-${String(lastDay).padStart(2, "0")}` };
}
