import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { AdminShell } from "@/components/fyxx/admin-sidebar";
import { InfoTip } from "@/components/fyxx/info-tip";
import { DataHealthChip } from "@/components/fyxx/data-health-chip";
import { useSoftGate } from "@/hooks/use-soft-gate";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getDashboardData } from "@/lib/dashboard.functions";
type DashboardData = NonNullable<Awaited<ReturnType<typeof getDashboardData>>>;
import tgrLogoDark from "@/assets/tgr-logo-dark.svg";
import talabatLogo from "@/assets/talabat-logo.png.asset.json";
import careemLogo from "@/assets/careem-logo-full.svg";
import {
  Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, LineChart,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { MonthPicker } from "@/components/fyxx/date-picker";
import { EmptyState } from "@/components/fyxx/empty-state";
import { fmtJOD0, fmtInt, platformsFromFilter, type Platform, type PlatformKey } from "@/lib/fyxx";
import { monthOfDate, monthLabel, prevMonth, lastDayOfMonth, type RangeKey } from "@/lib/months";
import { moneyTrail, moneyTrailPerMonth, type MoneyTrail, type MoneyTrailInput } from "@/lib/money-trail";
import { useRangeFilter } from "@/hooks/use-range-filter";
// Re-exported so other routes keep importing these from here. The money-trail primitives (cogsFor,
// exVat) are deliberately NOT re-exported: surfaces render moneyTrail's output, they do not recompute.
export { monthOfDate, lastDayOfMonth, prevMonth, monthLabel, monthsBetween, nextMonth, type RangeKey } from "@/lib/months";
export { type PlatformKey, platformsFromFilter } from "@/lib/fyxx";

// Empty input so the per-month/range memos can run before data has loaded (returns a zero trail).
const EMPTY_MONEY_INPUT: MoneyTrailInput = { financials: [], itemSales: [], costs: [], daily: [], itemAliases: {} };
/** A month's slice of the trail in the flat shape the charts and tables consume. */
function aggOf(t: MoneyTrail) {
  return {
    month: t.months[0], gross: t.gross, payout: t.payout, discount: t.discounts, cogs: t.cogs, orders: t.orders,
    productMargin: t.productMargin, commMargin: t.commMargin, netMargin: t.netMargin, netProfit: t.netProfit,
  };
}
/** KPI card view-model: same figures, margins as percentages for display. */
function kpiView(t: MoneyTrail) {
  return { gross: t.gross, aov: t.aov, orders: t.orders, netProfit: t.netProfit, prodMargin: t.productMargin * 100, netMargin: t.netMargin * 100 };
}
type MonthAgg = ReturnType<typeof aggOf>;

export const Route = createFileRoute("/dashboard")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "The Green Room · Delivery Dashboard" },
      { name: "description", content: "Live Talabat & Careem performance for The Green Room. Shareable read-only." },
      { property: "og:title", content: "The Green Room · Delivery Dashboard" },
      { property: "og:description", content: "Live Talabat & Careem performance for The Green Room." },
    ],
  }),
  component: PublicDashboard,
});


export function PublicDashboard() {
  const { adminUser, sessionChecked, handleSignOut } = useSoftGate();

  const fetchData = useServerFn(getDashboardData);
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => fetchData(),
    refetchOnWindowFocus: false,
  });

  const [platform, setPlatform] = useState<PlatformKey>("All");
  const platforms: string[] = platformsFromFilter(platform);
  const plats = platforms as Platform[]; // same values, typed for the money-trail calls

  // Reference "today" — derived from the latest daily sales date, falls back to real today.
  const today = useMemo(() => {
    const last = data?.daily.at(-1)?.date;
    return last ?? new Date().toISOString().slice(0, 10);
  }, [data]);
  const currentMonth = monthOfDate(today);

  // All months that appear anywhere in the data, sorted.
  const allMonths = useMemo(() => {
    if (!data) return [];
    const set = new Set<string>();
    data.daily.forEach((d) => set.add(monthOfDate(d.date)));
    data.financials.forEach((d) => set.add(d.month));
    data.itemSales.forEach((d) => set.add(d.month));
    return Array.from(set).sort();
  }, [data]);

  const { range, setRange, customFrom, customTo, handleCustomFrom, handleCustomTo, rangeMonths, rangeIsSingleMonth, rangeLabel } =
    useRangeFilter({ allMonths, today });

  // Does any data fall within the selected range? Drives the "no data" empty state.
  const rangeHasData = useMemo(() => {
    if (!data || !rangeMonths.length) return false;
    const set = new Set(rangeMonths);
    return (
      data.daily.some((d) => set.has(monthOfDate(d.date))) ||
      data.financials.some((f) => set.has(f.month)) ||
      data.itemSales.some((i) => set.has(i.month))
    );
  }, [data, rangeMonths]);

  // --- Money trail per month + range totals: the single shared computation (moneyTrail). Every
  //     figure below renders its output; nothing here recomputes gross, COGS, VAT or margins. ---
  const monthAggs: MonthAgg[] = useMemo(
    () => moneyTrailPerMonth(data ?? EMPTY_MONEY_INPUT, rangeMonths, plats).map(aggOf),
    [data, rangeMonths, platforms],
  );
  // Full history (all months, not just the range) so the trend charts always show the whole timeline.
  const allMonthAggs: MonthAgg[] = useMemo(
    () => moneyTrailPerMonth(data ?? EMPTY_MONEY_INPUT, allMonths, plats).map(aggOf),
    [data, allMonths, platforms],
  );

  const totals = useMemo(() => moneyTrail(data ?? EMPTY_MONEY_INPUT, rangeMonths, plats), [data, rangeMonths, platforms]);
  // Prior equal-length period, for the KPI deltas.
  const priorTotals = useMemo(() => {
    if (!data || range === "all" || !rangeMonths.length) return null;
    const len = rangeMonths.length;
    const firstIdx = allMonths.indexOf(rangeMonths[0]);
    if (firstIdx === -1 || firstIdx < len) return null;
    return moneyTrail(data, allMonths.slice(firstIdx - len, firstIdx), plats);
  }, [data, range, rangeMonths, platforms, allMonths]);

  const kpis = kpiView(totals);
  const priorKpis = priorTotals ? kpiView(priorTotals) : null;

  // Margin % with a near-zero denominator guard and outlier clamp.
  // Returns null so Recharts gaps the line rather than spiking off-scale.
  // Monthly margin series — always uses ALL months (not rangeMonths) so the trend chart never
  // blanks when a single month is selected. Platform filter still applies via allMonthAggs.
  const marginTrend = useMemo(
    () =>
      allMonthAggs.map((a, i, arr) => {
        const win = arr.slice(Math.max(0, i - 2), i + 1);
        const trailEnough = win.length >= 2;
        // Margins come from the trail (fractions). cm converts to a percentage with the same
        // near-zero guard the chart used before (base < 1.16 JOD means ex-VAT base < 1 JOD) and the
        // same off-scale clamp, so a noisy month gaps the line instead of spiking.
        const cm = (frac: number, base: number): number | null => {
          if (base < 1.16) return null;
          const v = frac * 100;
          return v < -500 || v > 500 ? null : v;
        };
        const validProds = win.map((w) => cm(w.productMargin, w.gross)).filter((v): v is number => v !== null);
        const validComms = win.map((w) => cm(w.commMargin, w.payout + w.discount)).filter((v): v is number => v !== null);
        const validNets = win.map((w) => cm(w.netMargin, w.payout)).filter((v): v is number => v !== null);
        return {
          label: monthLabel(a.month),
          prod: cm(a.productMargin, a.gross),
          comm: cm(a.commMargin, a.payout + a.discount),
          net: cm(a.netMargin, a.payout),
          prodTrail: trailEnough && validProds.length >= 2 ? validProds.reduce((s, v) => s + v, 0) / validProds.length : null,
          commTrail: trailEnough && validComms.length >= 2 ? validComms.reduce((s, v) => s + v, 0) / validComms.length : null,
          netTrail: trailEnough && validNets.length >= 2 ? validNets.reduce((s, v) => s + v, 0) / validNets.length : null,
        };
      }),
    [allMonthAggs],
  );

  // Shared active-days-per-month helper (orders denominator, per range).
  const activeDaysPerMonth = useMemo(() => {
    if (!data) return new Map<string, number>();
    const m = new Map<string, number>();
    for (const mo of monthAggs) {
      m.set(mo.month, new Set(
        data.daily
          .filter((d) => monthOfDate(d.date) === mo.month && platforms.includes(d.platform) && (d.orders ?? 0) > 0)
          .map((d) => d.date),
      ).size);
    }
    return m;
  }, [data, monthAggs, platforms]);

  // Full-history active-days — used by the order volume trend chart (always shows all months).
  const allActiveDaysPerMonth = useMemo(() => {
    if (!data) return new Map<string, number>();
    const m = new Map<string, number>();
    for (const mo of allMonthAggs) {
      m.set(mo.month, new Set(
        data.daily
          .filter((d) => monthOfDate(d.date) === mo.month && platforms.includes(d.platform) && (d.orders ?? 0) > 0)
          .map((d) => d.date),
      ).size);
    }
    return m;
  }, [data, allMonthAggs, platforms]);

  // Combined order volume trend (orders/day + sales/day) — always shows all months.
  const orderVolumeTrend = useMemo(() => {
    return allMonthAggs.map((a, i, arr) => {
      const days = allActiveDaysPerMonth.get(a.month) ?? 0;
      const ordersAvg = days > 0 ? a.orders / days : null;
      const salesAvg = days > 0 ? a.gross / days : null;
      const prevA = i > 0 ? arr[i - 1] : null;
      const prevDays = prevA ? (allActiveDaysPerMonth.get(prevA.month) ?? 0) : 0;
      const prevOrdersAvg = prevA && prevDays > 0 ? prevA.orders / prevDays : null;
      const prevSalesAvg = prevA && prevDays > 0 ? prevA.gross / prevDays : null;
      const ordersMomPct = ordersAvg != null && prevOrdersAvg != null && prevOrdersAvg > 0
        ? ((ordersAvg - prevOrdersAvg) / prevOrdersAvg) * 100 : null;
      const salesMomPct = salesAvg != null && prevSalesAvg != null && prevSalesAvg > 0
        ? ((salesAvg - prevSalesAvg) / prevSalesAvg) * 100 : null;
      const win = arr.slice(Math.max(0, i - 2), i + 1);
      const winOrders = win.map((w) => { const d = allActiveDaysPerMonth.get(w.month) ?? 0; return d > 0 ? w.orders / d : null; }).filter((v): v is number => v !== null);
      const winSales = win.map((w) => { const d = allActiveDaysPerMonth.get(w.month) ?? 0; return d > 0 ? w.gross / d : null; }).filter((v): v is number => v !== null);
      return {
        label: monthLabel(a.month),
        prevLabel: prevA ? monthLabel(prevA.month) : null,
        ordersAvg,
        salesAvg,
        ordersMomPct,
        salesMomPct,
        ordersTrail: win.length >= 2 && winOrders.length >= 2 ? winOrders.reduce((s, v) => s + v, 0) / winOrders.length : null,
        salesTrail: win.length >= 2 && winSales.length >= 2 ? winSales.reduce((s, v) => s + v, 0) / winSales.length : null,
      };
    });
  }, [allMonthAggs, allActiveDaysPerMonth]);

  const [showAvgTrailing, setShowAvgTrailing] = useState(false);

  // --- Pace tracker: current calendar month, but hold the finished month for the first 3 days
  //     of a new one so Lori has time to close it and set targets. Toggle is ephemeral (not persisted). ---
  const paceToday = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const realMonth = monthOfDate(paceToday);
  const holdPrev = Number(paceToday.slice(8, 10)) <= 3; // days 1-3 default to the previous month
  const defaultPaceMonth = holdPrev ? prevMonth(realMonth) : realMonth;
  const [showOtherPaceMonth, setShowOtherPaceMonth] = useState(false);
  const paceMonth = showOtherPaceMonth
    ? (defaultPaceMonth === realMonth ? prevMonth(realMonth) : realMonth)
    : defaultPaceMonth;
  // A completed month is measured to its month end; the live month to today.
  const paceAsOf = paceMonth === realMonth ? paceToday : lastDayOfMonth(paceMonth);
  const pace = useMemo(() => data ? computePace(data, paceMonth, paceAsOf) : null, [data, paceMonth, paceAsOf]);
  // The toggle switches to the other of {current, previous}; label it with that month.
  const togglesToMonth = paceMonth === realMonth ? prevMonth(realMonth) : realMonth;
  const paceToggleLabel = `Show ${new Date(togglesToMonth + "-01T00:00:00").toLocaleString("en-US", { month: "long" })}`;

  // --- All-time sales per platform, every month in the data, same basis as Sales by Platform
  //     (monthly_financials gross, falling back to summed daily). firstMonth surfaces the real
  //     start so the total never silently begins later than the data does. ---
  const allTime = useMemo(() => {
    if (!data) return null;
    const perPlatform = (p: "Talabat" | "Careem") =>
      allMonths.reduce((sum, m) => {
        const fin = data.financials.filter((f) => f.month === m && f.platform === p).reduce((s, f) => s + f.gross, 0);
        const day = data.daily.filter((d) => monthOfDate(d.date) === m && d.platform === p).reduce((s, d) => s + d.sales, 0);
        return sum + (fin || day);
      }, 0);
    const talabat = perPlatform("Talabat");
    const careem = perPlatform("Careem");
    // Earliest month present in the data. Surfaced on the card so the coverage start is explicit:
    // if October is in the data it reads "since Oct 25"; if it is missing it reads "since Nov 25".
    const firstMonth = allMonths[0] ?? null;
    return { talabat, careem, firstMonth };
  }, [data, allMonths]);

  // Distinct dates with any data in range + platform filter (used for avg/day KPI sub-stats).
  const activeDays = useMemo(() => {
    if (!data) return 1;
    const set = new Set(
      data.daily
        .filter((d) => rangeMonths.includes(monthOfDate(d.date)) && platforms.includes(d.platform))
        .map((d) => d.date),
    );
    return Math.max(1, set.size);
  }, [data, rangeMonths, platforms]);

  // Toggle for the 3-month trailing-average lines on the margin trend chart (off by default).
  const [showTrailing, setShowTrailing] = useState(false);

  // --- Chart series ---
  const chartData = useMemo(() => {
    if (!data) return [];
    if (rangeIsSingleMonth) {
      // Daily breakdown for the single month
      const m = rangeMonths[0];
      const [y, mm] = m.split("-").map(Number);
      const daysInMonth = new Date(Date.UTC(y, mm, 0)).getUTCDate();
      const endDay = m === currentMonth ? Number(today.slice(8, 10)) : daysInMonth;
      const byDay: Record<number, { Talabat: number; Careem: number }> = {};
      data.daily.forEach((d) => {
        if (monthOfDate(d.date) !== m) return;
        if (!platforms.includes(d.platform)) return;
        const day = Number(d.date.slice(8, 10));
        byDay[day] = byDay[day] ?? { Talabat: 0, Careem: 0 };
        byDay[day][d.platform as "Talabat" | "Careem"] += d.sales;
      });
      // A margin is a ratio, constant across the month, so the per-day product and net lines are the
      // month's margins from the trail; per-day net profit allocates the month's net profit in
      // proportion to that day's gross. Nothing is recomputed from raw figures.
      const agg = monthAggs[0];
      const prodPct = agg.gross > 1.16 ? agg.productMargin * 100 : null;
      const netPct = agg.gross > 1.16 ? agg.netMargin * 100 : null;
      const arr = [];
      for (let d = 1; d <= endDay; d++) {
        const v = byDay[d] ?? { Talabat: 0, Careem: 0 };
        const gross = v.Talabat + v.Careem;
        const prod = gross > 1.16 ? prodPct : null;
        const net = gross > 1.16 ? netPct : null;
        arr.push({
          label: `${monthLabel(m).split(" ")[0]} ${d}`,
          Talabat: v.Talabat, Careem: v.Careem,
          gross, prod, net, profit: agg.gross > 0 ? agg.netProfit * (gross / agg.gross) : 0,
          drag: prod != null && net != null ? prod - net : null, target: 45,
          avg7d: 0, // filled below
        });
      }
      // 7-day rolling average over the filtered daily gross
      for (let i = 0; i < arr.length; i++) {
        const win = arr.slice(Math.max(0, i - 6), i + 1);
        arr[i].avg7d = win.reduce((s, r) => s + r.gross, 0) / win.length;
      }
      return arr;
    }
    // One bar per month
    return rangeMonths.map((m) => {
      const finRows = data.financials.filter((f) => f.month === m && platforms.includes(f.platform));
      const talabat = finRows.filter((r) => r.platform === "Talabat").reduce((s, r) => s + r.gross, 0) ||
        data.daily.filter((d) => monthOfDate(d.date) === m && d.platform === "Talabat" && platforms.includes("Talabat")).reduce((s, d) => s + d.sales, 0);
      const careem = finRows.filter((r) => r.platform === "Careem").reduce((s, r) => s + r.gross, 0) ||
        data.daily.filter((d) => monthOfDate(d.date) === m && d.platform === "Careem" && platforms.includes("Careem")).reduce((s, d) => s + d.sales, 0);
      const agg = monthAggs.find((a) => a.month === m)!;
      const prod = agg.gross > 1.16 ? agg.productMargin * 100 : null;
      const net = agg.payout > 1.16 ? agg.netMargin * 100 : null;
      const profit = agg.netProfit;
      return {
        label: monthLabel(m),
        Talabat: platforms.includes("Talabat") ? talabat : 0,
        Careem: platforms.includes("Careem") ? careem : 0,
        gross: agg.gross, prod, net, profit,
        drag: prod != null && net != null ? prod - net : null, target: 45,
      };
    });
  }, [data, rangeIsSingleMonth, rangeMonths, monthAggs, platforms, currentMonth, today]);

  // Commission drag is a monthly figure by construction (payout and cost are only known per month,
  // so the daily bars are all identical). In a single-month view we show that one number instead.
  const singleMonthDrag = useMemo(
    () => (rangeIsSingleMonth ? chartData.find((r) => r.drag != null)?.drag ?? null : null),
    [rangeIsSingleMonth, chartData],
  );

  // Total sales over time: one point per month = combined gross incl VAT, per-platform financials
  // gross (falling back to summed daily), the same value as the Sales by Platform bars. Like the
  // Margin over Time chart beside it, this is a trend, so it always shows full monthly history and
  // ignores the date filter (the platform filter still applies). "In progress" is the real current
  // calendar month only, so a completed month is never flagged just because it is the newest data.
  const salesTrend = useMemo(() => {
    if (!data) return [];
    // Combined gross and orders per month come straight from the trail (allMonthAggs), not recomputed.
    const base = allMonthAggs.map((a) => ({
      month: a.month, label: monthLabel(a.month), total: a.gross, orders: a.orders, partial: a.month === realMonth,
    }));
    const completed = base.filter((r) => !r.partial);
    // 3-month floor = lowest combined monthly gross across the month and the two before it.
    // Only over "real" trading months: any month with fewer than 5 orders (the Oct 2025 launch
    // week was 3 orders on one platform) is excluded so it never drags a window down. The series
    // starts once three eligible months exist.
    const eligible = completed.filter((r) => r.orders >= 5);
    const floorByMonth = new Map<string, number>();
    for (let i = 2; i < eligible.length; i++) {
      floorByMonth.set(eligible[i].month, Math.min(eligible[i].total, eligible[i - 1].total, eligible[i - 2].total));
    }
    const rows = base.map((r) => {
      let avg3: number | null = null;
      if (!r.partial) {
        const idx = completed.findIndex((c) => c.month === r.month);
        // 3-month moving average over completed months only, from the third month onward.
        if (idx >= 2) avg3 = (completed[idx].total + completed[idx - 1].total + completed[idx - 2].total) / 3;
      }
      return {
        ...r,
        totalSolid: r.partial ? null : (r.total as number | null),
        totalPartial: null as number | null,
        avg3,
        floor: floorByMonth.get(r.month) ?? null,
        floorStepUp: false,
        floorPrev: null as number | null,
      };
    });
    // Mark floor step-ups: a month whose floor is higher than the previous month that had one.
    // These are the "new higher low" moments worth seeing. Decreases and flat months are not marked.
    let prevFloor: number | null = null;
    for (const row of rows) {
      if (row.floor == null) continue;
      if (prevFloor != null && row.floor > prevFloor) {
        row.floorStepUp = true;
        row.floorPrev = prevFloor;
      }
      prevFloor = row.floor;
    }
    // Dashed connector into the in-progress month: anchor it to the previous point.
    const pIdx = rows.findIndex((r) => r.partial);
    if (pIdx >= 0) {
      rows[pIdx].totalPartial = rows[pIdx].total;
      if (pIdx > 0) rows[pIdx - 1].totalPartial = rows[pIdx - 1].total;
    }
    return rows;
  }, [data, allMonthAggs, realMonth]);

  // Current floor and the month it was set (start of the trailing run at the current value), for
  // the caption. Plain and factual: this is where the base sits now, not a target.
  const salesFloorNow = useMemo(() => {
    const withFloor = salesTrend.filter((r) => r.floor != null);
    if (!withFloor.length) return null;
    const value = withFloor[withFloor.length - 1].floor as number;
    let i = withFloor.length - 1;
    while (i > 0 && withFloor[i - 1].floor === value) i--;
    const sinceMonth = new Date(`${withFloor[i].month}-01T00:00:00`).toLocaleString("en-US", { month: "long" });
    return { value, sinceMonth };
  }, [salesTrend]);

  if (!sessionChecked || isLoading || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Loading dashboard…
      </div>
    );
  }

  return (
    <AdminShell admin={adminUser} onSignOut={handleSignOut}>
    <div className="min-h-screen bg-background text-foreground">
      <Header today={today} lastDailyDate={data.daily.at(-1)?.date ?? null} showNav={!adminUser} statusChip={adminUser ? <DataHealthChip /> : null} />

      <div className="max-w-[1180px] mx-auto px-4 md:px-7 pt-5 md:pt-7 pb-20">
        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center mb-5">
          <Segmented
            options={[
              { v: "this", l: "This Month" },
              { v: "last", l: "Last Month" },
              { v: "ytd", l: "YTD" },
              { v: "custom", l: "Custom" },
              { v: "all", l: "All-Time" },
            ]}
            value={range}
            onChange={(v) => setRange(v as RangeKey)}
          />
          {range === "custom" && (
            <div className="flex gap-2 items-center bg-card border border-border rounded-full px-3 py-1 text-xs">
              <label className="text-muted-foreground">From</label>
              <div className="w-36"><MonthPicker value={customFrom} onChange={handleCustomFrom} /></div>
              <label className="text-muted-foreground">To</label>
              <div className="w-36"><MonthPicker value={customTo} onChange={handleCustomTo} min={customFrom} /></div>
            </div>
          )}
          <Segmented
            platform
            options={[
              { v: "All", l: "All" },
              { v: "Talabat", l: "Talabat" },
              { v: "Careem", l: "Careem" },
            ]}
            value={platform}
            onChange={(v) => setPlatform(v as PlatformKey)}
          />
        </div>

        {/* PACE TRACKER — current month (holds the finished month for the first 3 days), all platforms, ignores filters */}
        <PaceTracker
          pace={pace}
          currentMonth={paceMonth}
          toggle={{ label: paceToggleLabel, onToggle: () => setShowOtherPaceMonth((v) => !v) }}
        />

        {!rangeHasData ? (
          <EmptyState label={rangeLabel} />
        ) : (
        <>
        {/* KPI cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5 mb-4">
          <Kpi label="Sales (incl VAT)" value={fmtInt(kpis.gross)} unit="JOD"
               delta={priorKpis ? pctDelta(kpis.gross, priorKpis.gross) : null}
               prior={priorKpis ? `Prior: ${fmtJOD0(priorKpis.gross)}` : platformContext(platform)}
               sub={`avg ${fmtJOD0(kpis.gross / activeDays)}/day`}
               infoId="sales_incl_vat" />
          <Kpi label="Avg Basket (AOV)" value={kpis.aov ? kpis.aov.toFixed(2) : "-"} unit="JOD"
               delta={priorKpis && priorKpis.aov ? pctDelta(kpis.aov, priorKpis.aov) : null}
               prior={priorKpis && priorKpis.aov ? `Prior: ${priorKpis.aov.toFixed(2)} JOD` : "sales ÷ orders"}
               sub={`avg ${(kpis.orders / activeDays).toFixed(1)} orders/day`}
               infoId="aov" />
          <Kpi label="Product Margin" value={kpis.prodMargin.toFixed(1)} unit="%"
               delta={priorKpis ? ptDelta(kpis.prodMargin, priorKpis.prodMargin) : null}
               prior={priorKpis ? `Prior: ${priorKpis.prodMargin.toFixed(1)}%` : "on menu price exVAT"}
               infoId="product_margin" />
          <Kpi label="Net Margin · after commission" value={kpis.netMargin.toFixed(1)} unit="%"
               delta={priorKpis ? ptDelta(kpis.netMargin, priorKpis.netMargin) : null}
               prior={priorKpis ? `Prior: ${priorKpis.netMargin.toFixed(1)}%` : "on payout exVAT"}
               infoId="net_margin" />
          <Kpi label="Net Profit Kept" value={fmtInt(kpis.netProfit)} unit="JOD"
               delta={priorKpis ? pctDelta(kpis.netProfit, priorKpis.netProfit) : null}
               prior={priorKpis ? `Prior: ${fmtJOD0(priorKpis.netProfit)}` : "payout exVAT − cost"}
               infoId="net_profit_kept" />
        </div>

        {/* All-time sales per platform — one quiet line under the KPI row; only the platform
            names carry brand colour, the numbers stay in the normal text colour. */}
        {allTime && (
          <div className="text-[11px] text-muted-foreground mb-4">
            All-time{allTime.firstMonth
              ? ` since ${new Date(allTime.firstMonth + "-01T00:00:00").toLocaleString("en-US", { month: "short", year: "numeric" })}`
              : ""}
            {" · "}
            <span className="font-semibold" style={{ color: "#FF5A00" }}>Talabat</span>{" "}
            <span className="text-foreground">{fmtInt(allTime.talabat)} JOD</span>
            {" · "}
            <span className="font-semibold" style={{ color: "#1BD15D" }}>Careem</span>{" "}
            <span className="text-foreground">{fmtInt(allTime.careem)} JOD</span>
          </div>
        )}

        <SectionLabel>Analytics · Controlled by the Range &amp; Platform Filters Above</SectionLabel>
        <ChartCard title="Sales by Platform" sub={rangeIsSingleMonth ? "Daily gross sales incl VAT" : "Gross sales incl VAT"} infoId="chart_sales_by_platform" footnote="Careem shown on food-basket basis (your revenue), ~11% below Careem's GMV headline. See tooltip.">
          <ResponsiveContainer>
            <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} />
              <YAxis stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
              <Tooltip {...tooltipStyle} formatter={(v: number) => fmtJOD0(v)} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {platforms.includes("Talabat") && <Bar dataKey="Talabat" stackId={rangeIsSingleMonth ? "a" : undefined} fill="var(--talabat)" radius={[3, 3, 0, 0]} />}
              {platforms.includes("Careem") && <Bar dataKey="Careem" stackId={rangeIsSingleMonth ? "a" : undefined} fill="var(--careem)" radius={[3, 3, 0, 0]} />}
              {rangeIsSingleMonth && (
                <Line type="monotone" dataKey="avg7d" name="7-day avg" stroke="#f5b400" strokeWidth={2} dot={false} strokeDasharray="4 2" />
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </ChartCard>

        {salesTrend.length >= 1 && (
          <>
          <SectionLabel>Total Sales · Monthly</SectionLabel>
          <ChartCard
            title="Total sales over time"
            action={
              salesFloorNow ? (
                <div className="text-[11px] text-muted-foreground text-right leading-tight">
                  Current floor <span className="font-semibold text-foreground">{fmtJOD0(salesFloorNow.value)}</span>
                  <div className="text-[10px]">since {salesFloorNow.sinceMonth}</div>
                </div>
              ) : undefined
            }
            sub={
              platform === "All"
                ? "Combined monthly gross incl VAT (Talabat + Careem), full monthly history, not affected by the date filter above. The 3-month floor is the lowest total across each month and the two before it; a yellow point marks where that floor steps up."
                : `${platform} monthly gross incl VAT, full monthly history, not affected by the date filter above. The 3-month floor is the lowest total across each month and the two before it; a yellow point marks where that floor steps up.`
            }
          >
            <ResponsiveContainer>
              <LineChart data={salesTrend} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v) => Math.round(Number(v)).toLocaleString()} />
                <Tooltip content={<SalesTrendTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Line isAnimationActive={false} type="monotone" dataKey="totalSolid" name="Monthly total" stroke="var(--primary)" strokeWidth={2.5} dot={{ r: 3.5, fill: "var(--primary)", strokeWidth: 0 }} activeDot={{ r: 5 }} connectNulls={false} />
                <Line isAnimationActive={false} type="monotone" dataKey="totalPartial" name="In progress" stroke="var(--primary)" strokeWidth={2} strokeDasharray="4 3" dot={<PartialDot />} activeDot={false} connectNulls={false} legendType="none" />
                {salesTrend.some((r) => r.avg3 !== null) && (
                  <Line isAnimationActive={false} type="monotone" dataKey="avg3" name="3-month average" stroke="#C8B89B" strokeWidth={2} strokeDasharray="5 3" dot={false} connectNulls={false} />
                )}
                {salesTrend.some((r) => r.floor !== null) && (
                  <Line isAnimationActive={false} type="monotone" dataKey="floor" name="3-month floor" stroke="var(--muted-foreground)" strokeWidth={1.5} strokeOpacity={0.65} dot={<FloorDot />} activeDot={{ r: 4 }} connectNulls={false} />
                )}
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
          </>
        )}

        {allMonthAggs.length >= 2 && (
          <>
            <SectionLabel>Margin Trend · Monthly</SectionLabel>
            <ChartCard
              title="Margin over Time"
              sub="Product → After commission → Net margin. Full monthly history; not affected by the date filter above"
              infoId="chart_margin_trend"
              action={
                marginTrend.some((d) => d.netTrail !== null) ? (
                  <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground cursor-pointer select-none">
                    <input
                      type="checkbox"
                      className="accent-primary"
                      checked={showTrailing}
                      onChange={(e) => setShowTrailing(e.target.checked)}
                    />
                    3m trailing avg
                  </label>
                ) : null
              }
            >
              <ResponsiveContainer>
                <LineChart data={marginTrend} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} />
                  <YAxis
                    stroke="var(--muted-foreground)"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => `${v}%`}
                    domain={[0, 100]}
                    allowDataOverflow
                  />
                  <Tooltip {...tooltipStyle} formatter={(v: number) => `${v.toFixed(1)}%`} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <ReferenceLine
                    y={45}
                    stroke="var(--muted-foreground)"
                    strokeDasharray="6 4"
                    label={{ value: "Target 45%", fill: "var(--muted-foreground)", fontSize: 10, position: "insideTopRight" }}
                  />
                  {/* Three clearly distinct colors: charcoal / taupe / green */}
                  <Line isAnimationActive={false} type="monotone" dataKey="prod" name="Product margin" stroke="var(--foreground)" strokeWidth={2} dot={{ r: 4, fill: "var(--foreground)", strokeWidth: 0 }} activeDot={{ r: 5 }} />
                  <Line isAnimationActive={false} type="monotone" dataKey="comm" name="After commission" stroke="#C8B89B" strokeWidth={2} dot={{ r: 4, fill: "#C8B89B", strokeWidth: 0 }} activeDot={{ r: 5 }} />
                  <Line isAnimationActive={false} type="monotone" dataKey="net" name="Net (after commission + promos)" stroke="var(--primary)" strokeWidth={2} dot={{ r: 4, fill: "var(--primary)", strokeWidth: 0 }} activeDot={{ r: 5 }} />
                  {showTrailing && <Line isAnimationActive={false} type="monotone" dataKey="prodTrail" name="Product 3m avg" stroke="var(--foreground)" strokeWidth={1.5} strokeDasharray="5 3" dot={false} connectNulls={false} />}
                  {showTrailing && <Line isAnimationActive={false} type="monotone" dataKey="commTrail" name="After commission 3m avg" stroke="#C8B89B" strokeWidth={1.5} strokeDasharray="5 3" dot={false} connectNulls={false} />}
                  {showTrailing && <Line isAnimationActive={false} type="monotone" dataKey="netTrail" name="Net 3m avg" stroke="var(--primary)" strokeWidth={1.5} strokeDasharray="5 3" dot={false} connectNulls={false} />}
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          </>
        )}

        {orderVolumeTrend.length >= 2 && (
          <>
            <SectionLabel>Order Volume Trend · Monthly</SectionLabel>
            <ChartCard
              title="Order Volume Trend"
              sub="Avg orders/day (left) vs avg sales/day JOD (right), full history; not affected by the date filter above"
              infoId="chart_order_volume"
              action={
                orderVolumeTrend.some((d) => d.ordersTrail !== null) ? (
                  <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground cursor-pointer select-none">
                    <input type="checkbox" className="accent-primary" checked={showAvgTrailing} onChange={(e) => setShowAvgTrailing(e.target.checked)} />
                    3m avg
                  </label>
                ) : null
              }
            >
              <ResponsiveContainer>
                <LineChart data={orderVolumeTrend} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} />
                  <YAxis yAxisId="orders" orientation="left" stroke="var(--foreground)" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => v.toFixed(1)} />
                  <YAxis yAxisId="sales" orientation="right" stroke="#C8B89B" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => Math.round(v).toString()} />
                  <Tooltip content={<OrderVolumeTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line isAnimationActive={false} yAxisId="orders" type="monotone" dataKey="ordersAvg" name="Avg orders/day" stroke="var(--foreground)" strokeWidth={2} dot={{ r: 4, fill: "var(--foreground)", strokeWidth: 0 }} activeDot={{ r: 5 }} connectNulls={false} />
                  <Line isAnimationActive={false} yAxisId="sales" type="monotone" dataKey="salesAvg" name="Avg JOD/day" stroke="#C8B89B" strokeWidth={2} dot={{ r: 4, fill: "#C8B89B", strokeWidth: 0 }} activeDot={{ r: 5 }} connectNulls={false} />
                  {showAvgTrailing && <Line isAnimationActive={false} yAxisId="orders" type="monotone" dataKey="ordersTrail" name="Orders 3m avg" stroke="var(--foreground)" strokeWidth={1.5} strokeDasharray="5 3" dot={false} connectNulls={false} />}
                  {showAvgTrailing && <Line isAnimationActive={false} yAxisId="sales" type="monotone" dataKey="salesTrail" name="JOD 3m avg" stroke="#C8B89B" strokeWidth={1.5} strokeDasharray="5 3" dot={false} connectNulls={false} />}
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          </>
        )}

        <SectionLabel>Profitability Detail</SectionLabel>
        <div className="grid lg:grid-cols-2 gap-3.5">
          <ChartCard title="Net Profit Kept (JOD)" sub="Actual payout exVAT − cost of goods · what lands with you" infoId="net_profit_kept">
            <ResponsiveContainer>
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip {...tooltipStyle} formatter={(v: number) => fmtJOD0(v)} />
                <Bar dataKey="profit" fill="rgba(63,209,122,0.8)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
          <ChartCard title="The Commission Drag" sub="Margin points lost to platform fees and discounts" infoId="chart_commission_drag">
            {rangeIsSingleMonth ? (
              <div className="h-full flex flex-col items-center justify-center text-center px-4">
                {singleMonthDrag != null ? (
                  <>
                    <div className="font-display text-[46px] font-bold leading-none" style={{ color: "var(--foreground)" }}>
                      {singleMonthDrag.toFixed(1)}<span className="text-[20px] font-semibold text-muted-foreground ml-1">pts</span>
                    </div>
                    <div className="text-sm text-muted-foreground mt-3">
                      Commission drag in {new Date(rangeMonths[0] + "-01T00:00:00").toLocaleString("en-US", { month: "long", year: "numeric" })}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1.5 max-w-xs leading-relaxed">
                      Product margin minus net margin. It is one figure for the month and does not vary by day. Pick a wider range to see it move month to month.
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-muted-foreground">No data for this month.</div>
                )}
              </div>
            ) : (
              <ResponsiveContainer>
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false}
                         tickFormatter={(v) => `${v}pt`} />
                  <Tooltip {...tooltipStyle} formatter={(v: number) => `${v.toFixed(1)} pts`} />
                  <Bar dataKey="drag" fill="rgba(255,90,0,0.75)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>
        </>
        )}

        <div className="mt-8 pt-4 border-t border-border text-[10px] text-muted-foreground text-center">
          The Green Room × Talabat &amp; Careem
        </div>
      </div>
    </div>
    </AdminShell>
  );
}

// ---------- small UI primitives ----------
export function Header({
  today, lastDailyDate, showNav = true, statusChip,
}: {
  today: string;
  lastDailyDate: string | null;
  showNav?: boolean;
  statusChip?: ReactNode;
}) {
  const fresh = useFreshness(today, lastDailyDate);
  // Understated admin entry point, shown only to guests (signed-in admins use the sidebar).
  const signIn = showNav ? (
    <Link
      to="/auth"
      className="inline-flex items-center rounded-full border border-border px-3 py-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors whitespace-nowrap"
    >
      Admin sign in
    </Link>
  ) : null;
  return (
    <div className="border-b border-border bg-card sticky top-0 z-50">
      {/* Mobile: two compact rows */}
      <div className="flex md:hidden flex-col px-4 py-2.5 gap-1.5">
        <div className="flex items-center justify-between gap-2">
          <img src={tgrLogoDark} alt="The Green Room" className="h-8 w-auto" />
          <div className="flex items-center gap-2 min-w-0">
            {showNav && (
              <nav className="flex items-center gap-1 bg-background border border-border rounded-full p-1">
                <Link
                  to="/dashboard"
                  className="text-[11px] font-semibold px-3 py-1 rounded-full transition-colors"
                  activeProps={{ style: { background: "#f4efe7", color: "#1a1a1a" } }}
                  inactiveProps={{ className: "text-muted-foreground hover:text-foreground" }}
                >Dashboard</Link>
                <Link
                  to="/insights"
                  className="text-[11px] font-semibold px-3 py-1 rounded-full transition-colors"
                  activeProps={{ style: { background: "#f4efe7", color: "#1a1a1a" } }}
                  inactiveProps={{ className: "text-muted-foreground hover:text-foreground" }}
                >Insights</Link>
              </nav>
            )}
            {signIn}
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          <h1 className="font-display text-[14px] font-semibold leading-none">The Green Room</h1>
          <div className="flex items-center gap-2 shrink-0">
            {statusChip}
            <div className="flex items-center gap-1 text-[10px]">
              <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: fresh.color }} />
              <span style={{ color: fresh.color }}>{fresh.text}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Desktop: single row */}
      <div className="hidden md:flex items-center justify-between px-7 py-3.5 gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <div className="flex items-center gap-3 shrink-0">
            <img src={tgrLogoDark} alt="The Green Room" className="h-10 w-auto" />
            <span className="text-muted-foreground text-xs">×</span>
            <img src={talabatLogo.url} alt="talabat" className="h-5 w-auto" />
            <span className="text-muted-foreground text-xs">×</span>
            <img src={careemLogo} alt="Careem" className="h-5 w-auto" />
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-[17px] font-semibold leading-none truncate">The Green Room · Delivery Dashboard</h1>
            <div className="text-[10px] text-muted-foreground mt-1">Talabat &amp; Careem · shareable read-only link</div>
          </div>
        </div>
        <div className="flex items-center gap-4 shrink-0">
          {showNav && (
            <nav className="flex items-center gap-1 bg-background border border-border rounded-full p-1">
              <Link
                to="/dashboard"
                className="text-[11px] font-semibold px-3 py-1 rounded-full transition-colors"
                activeProps={{ style: { background: "#f4efe7", color: "#1a1a1a" } }}
                inactiveProps={{ className: "text-muted-foreground hover:text-foreground" }}
              >Dashboard</Link>
              <Link
                to="/insights"
                className="text-[11px] font-semibold px-3 py-1 rounded-full transition-colors"
                activeProps={{ style: { background: "#f4efe7", color: "#1a1a1a" } }}
                inactiveProps={{ className: "text-muted-foreground hover:text-foreground" }}
              >Insights</Link>
            </nav>
          )}
          <div className="flex items-center gap-1.5 text-[11px]">
            <span className="inline-block w-2 h-2 rounded-full animate-pulse" style={{ background: fresh.color }} />
            <span style={{ color: fresh.color }}>{fresh.text}</span>
          </div>
          {statusChip}
          {signIn}
        </div>
      </div>
    </div>
  );
}

function useFreshness(today: string, last: string | null): { text: string; color: string } {
  if (!last) return { text: "No data yet", color: "var(--muted-foreground)" };
  const days = Math.round((Date.parse(today) - Date.parse(last)) / 86400_000);
  const nice = new Date(last).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  if (days <= 1) return { text: `Data current as of ${nice}`, color: "var(--careem)" };
  if (days <= 3) return { text: `Updated ${days} days ago (${nice})`, color: "var(--primary)" };
  return { text: `⚠ Stale, last update ${days} days ago (${nice})`, color: "var(--destructive)" };
}

export function Segmented<T extends string>({
  options, value, onChange, platform = false,
}: {
  options: { v: T; l: string }[];
  value: T;
  onChange: (v: T) => void;
  platform?: boolean;
}) {
  return (
    <div className="flex bg-card border border-border rounded-full p-1 gap-1">
      {options.map((o) => {
        const active = o.v === value;
        const activeBg =
          platform && o.v === "Talabat" ? "var(--talabat)" :
          platform && o.v === "Careem" ? "var(--careem)" :
          "#f4efe7";
        const activeFg =
          platform && o.v === "Talabat" ? "var(--talabat-foreground)" :
          platform && o.v === "Careem" ? "var(--careem-foreground)" :
          "#1a1a1a";
        return (
          <button
            key={o.v}
            onClick={() => onChange(o.v)}
            className="text-[11.5px] font-semibold px-4 py-2 rounded-full transition-colors"
            style={{
              background: active ? activeBg : "transparent",
              color: active ? activeFg : "var(--muted-foreground)",
            }}
          >
            {o.l}
          </button>
        );
      })}
    </div>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-[1px] font-bold mt-6 mb-3" style={{ color: "var(--primary)" }}>
      {children}
    </div>
  );
}

export function Kpi({
  label, value, unit, delta, prior, sub, infoId,
}: {
  label: string;
  value: string;
  unit: string;
  delta: { up: boolean; text: string; good: boolean } | null;
  prior: string;
  sub?: string;
  infoId?: string;
}) {
  const deltaColor = !delta ? "var(--muted-foreground)" : delta.good ? "var(--careem)" : "var(--destructive)";
  return (
    <div className="bg-card border border-border rounded-2xl p-4">
      <div className="text-[9.5px] uppercase tracking-[0.8px] font-semibold text-muted-foreground flex items-center">
        {label}{infoId && <InfoTip id={infoId} />}
      </div>
      <div className="font-display text-[25px] font-semibold mt-1.5">
        {value} <span className="text-[13px] text-muted-foreground">{unit}</span>
      </div>
      <div className="text-[10.5px] font-semibold mt-1" style={{ color: deltaColor }}>
        {delta ? delta.text : "no prior period"}
      </div>
      <div className="text-[10px] text-muted-foreground mt-1.5 pt-1.5 border-t border-border">{prior}</div>
      {sub && <div className="text-[9.5px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function ChartCard({ title, sub, children, action, infoId, footnote }: { title: string; sub: string; children: React.ReactNode; action?: React.ReactNode; infoId?: string; footnote?: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4">
      <div className="flex items-start justify-between gap-2 mb-0.5">
        <h3 className="font-display text-[15px] font-semibold flex items-center">
          {title}{infoId && <InfoTip id={infoId} side="bottom" />}
        </h3>
        {action}
      </div>
      <div className="text-[10.5px] text-muted-foreground mb-3">{sub}</div>
      <div className="h-[230px]">{children}</div>
      {footnote && <div className="text-[10px] text-muted-foreground/80 mt-2 leading-snug">{footnote}</div>}
    </div>
  );
}

export type PaceData = {
  rows: { platform: "Talabat" | "Careem"; sales: number; target: number; achievement: number }[];
  totalSales: number; totalTarget: number; totalAchievement: number;
  proRated: number; proRatedAch: number;
  dayOfMonth: number; daysInMonth: number; workingDay: number;
  dataThroughLabel: string | null;
  dataThroughStale: boolean;
  perPlatformThrough: { platform: "Talabat" | "Careem"; label: string }[];
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

  return {
    rows, totalSales, totalTarget, totalAchievement, proRated, proRatedAch,
    dayOfMonth, daysInMonth, workingDay,
    dataThroughLabel, dataThroughStale, perPlatformThrough,
  };
}

function AvgDayTooltip({ active, payload, unit, fmt }: {
  active?: boolean;
  payload?: { value: number; name: string; payload: { label: string; prevLabel: string | null; momPct: number | null } }[];
  label?: string;
  unit: string;
  fmt: (v: number) => string;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  const { label, prevLabel, momPct } = p.payload;
  const isTrail = p.name.includes("avg") && payload.length > 1;
  const mainEntry = payload.find((e) => e.name !== "3m avg") ?? p;
  return (
    <div style={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, padding: "8px 12px", lineHeight: 1.6 }}>
      <div style={{ color: "var(--foreground)", fontWeight: 600 }}>{label}</div>
      {payload.map((e) => (
        <div key={e.name} style={{ color: "var(--muted-foreground)" }}>
          {e.name}: <span style={{ color: "var(--foreground)", fontWeight: 500 }}>{fmt(e.value)} {unit}</span>
        </div>
      ))}
      {momPct != null && !isTrail && (
        <div style={{ marginTop: 2, fontWeight: 600, color: momPct >= 0 ? "var(--careem)" : "var(--destructive)" }}>
          {momPct >= 0 ? "▲" : "▼"} {momPct >= 0 ? "+" : ""}{Math.round(momPct)}% vs {prevLabel}
        </div>
      )}
    </div>
  );
}

function OrderVolumeTooltip({ active, payload }: {
  active?: boolean;
  payload?: { value: number; name: string; color: string; payload: { label: string; prevLabel: string | null; ordersMomPct: number | null; salesMomPct: number | null } }[];
}) {
  if (!active || !payload?.length) return null;
  const { label, prevLabel, ordersMomPct, salesMomPct } = payload[0].payload;
  const ordersEntry = payload.find((e) => e.name === "Avg orders/day" || e.name === "Orders 3m avg");
  const salesEntry = payload.find((e) => e.name === "Avg JOD/day" || e.name === "JOD 3m avg");
  return (
    <div style={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, padding: "8px 12px", lineHeight: 1.6 }}>
      <div style={{ color: "var(--foreground)", fontWeight: 600 }}>{label}</div>
      {ordersEntry && (
        <div style={{ color: "var(--muted-foreground)" }}>
          Orders/day: <span style={{ color: "var(--foreground)", fontWeight: 500 }}>{ordersEntry.value.toFixed(1)}</span>
          {ordersMomPct != null && (
            <span style={{ marginLeft: 6, fontWeight: 600, color: ordersMomPct >= 0 ? "var(--careem)" : "var(--destructive)" }}>
              {ordersMomPct >= 0 ? "+" : ""}{Math.round(ordersMomPct)}% vs {prevLabel}
            </span>
          )}
        </div>
      )}
      {salesEntry && (
        <div style={{ color: "var(--muted-foreground)" }}>
          JOD/day: <span style={{ color: "var(--foreground)", fontWeight: 500 }}>{Math.round(salesEntry.value)}</span>
          {salesMomPct != null && (
            <span style={{ marginLeft: 6, fontWeight: 600, color: salesMomPct >= 0 ? "var(--careem)" : "var(--destructive)" }}>
              {salesMomPct >= 0 ? "+" : ""}{Math.round(salesMomPct)}% vs {prevLabel}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

export function PaceTracker({ pace, currentMonth, toggle }: {
  pace: PaceData | null; currentMonth: string;
  toggle?: { label: string; onToggle: () => void };
}) {
  if (!pace) return null;

  // "August 2026", not "Aug 26" (which scans as a day-of-month).
  const monthTitle = new Date(currentMonth + "-01T00:00:00").toLocaleString("en-US", { month: "long", year: "numeric" });

  // Target not set (interactive Overview only): no target for the shown month. Show a distinct
  // TGR-yellow "needs attention" card with the toggle, and no percentage, badge or progress bar.
  if (toggle && pace.totalTarget <= 0) {
    return (
      <div className="rounded-2xl border p-4 mb-4 shadow-sm"
           style={{ background: "#EEC36A", borderColor: "rgba(9,39,39,0.25)", color: "#092727" }}>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h3 className="font-display text-sm font-semibold whitespace-nowrap">{monthTitle} · Combined</h3>
          <button
            type="button"
            onClick={toggle.onToggle}
            className="inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold transition-colors"
            style={{ border: "1px solid rgba(9,39,39,0.35)", background: "rgba(9,39,39,0.08)", color: "#092727" }}
          >
            {toggle.label}
          </button>
        </div>
        <div className="mt-2 text-sm font-semibold">Target not set</div>
        <div className="mt-0.5 text-[11.5px]" style={{ color: "rgba(9,39,39,0.7)" }}>
          Set this month's targets on the Data entry page to track pace.
        </div>
      </div>
    );
  }

  const colorFor = (p: "Talabat" | "Careem") => p === "Talabat" ? "#FF5A00" : "#1BD15D";
  const pctColor = (n: number) => n >= 100 ? "var(--careem)" : "#f5b400";
  const careem = pace.rows.find((r) => r.platform === "Careem");
  const talabat = pace.rows.find((r) => r.platform === "Talabat");

  // Segments of the combined bar. The bar fills to combined/target (capped at 100%),
  // then splits proportionally to each platform's actual sales — so the bigger seller
  // always shows the longer segment, even when combined sales exceed the target.
  const segSales = (careem?.sales ?? 0) + (talabat?.sales ?? 0);
  const segFill = pace.totalTarget > 0 ? Math.min(segSales / pace.totalTarget, 1) * 100 : 0;
  const segCareemShare = segSales > 0 ? (careem?.sales ?? 0) / segSales : 0;
  const segCareem = segFill * segCareemShare;
  const segCappedTalabat = segFill * (1 - segCareemShare);

  // Combined target status (combined figure vs combined target only). Once cumulative >= target the
  // month is settled: "Target reached" on any day, and it cannot reverse. A completed month left
  // under target reads "Target missed". Otherwise the in-progress pace figure stands.
  const targetSet = pace.totalTarget > 0;
  const reached = targetSet && pace.totalSales >= pace.totalTarget;
  const complete = pace.dayOfMonth >= pace.daysInMonth;
  const missed = complete && targetSet && !reached;

  return (
    <div className="rounded-2xl border border-border bg-card p-4 mb-4 shadow-sm">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <h3 className="font-display text-sm font-semibold whitespace-nowrap">
            {monthTitle} · Combined
          </h3>
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold bg-background/40 border border-border">
            <span className="text-muted-foreground">WD</span>
            <span style={{ color: "var(--primary)" }}>{pace.workingDay}</span>
            <InfoTip id="working_days" side="bottom" />
          </span>
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold bg-background/40 border border-border">
            <span className="text-muted-foreground">Day</span>
            <span style={{ color: "var(--primary)" }}>{pace.dayOfMonth}<span className="text-muted-foreground">/{pace.daysInMonth}</span></span>
          </span>
          {pace.dataThroughLabel && (
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold bg-background/40 border border-border"
              title={pace.perPlatformThrough.map((x) => `${x.platform}: through ${x.label}`).join(" · ")}
              style={{ color: pace.dataThroughStale ? "#f5b400" : "var(--muted-foreground)" }}
            >
              data through {pace.dataThroughLabel}
              <InfoTip id="data_through" side="bottom" />
            </span>
          )}
          {toggle && (
            <button
              type="button"
              onClick={toggle.onToggle}
              className="inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-semibold border border-border text-muted-foreground hover:text-foreground hover:bg-background/60 transition-colors"
            >
              {toggle.label}
            </button>
          )}
        </div>
        <div className="text-right leading-none">
          <span className="font-display text-[26px] font-bold align-middle"
                style={{ color: pctColor(pace.totalAchievement) }}>
            {targetSet ? Math.round(pace.totalAchievement) + "%" : "-"}
          </span>
          <InfoTip id="pace_pct" side="bottom" />
          {reached || missed ? (
            <span
              className={`ml-2 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold align-middle ${
                reached ? "bg-success/10 text-success border-success/30" : "bg-muted text-muted-foreground border-border"
              }`}
            >
              {reached ? "Target reached" : "Target missed"}
            </span>
          ) : (
            <>
              <span className="ml-2 text-[10.5px] text-muted-foreground align-middle">
                {targetSet ? `${Math.round(pace.proRatedAch)}% of pace` : "no target set"}
              </span>
              {targetSet && <InfoTip id="pace_prorated" side="bottom" />}
            </>
          )}
        </div>
      </div>

      {/* Combined stacked progress bar with visible % labels */}
      <div className="mt-3 h-2.5 rounded-md overflow-hidden flex relative bg-muted">
        <div className="h-full transition-all relative group" style={{ width: `${segCareem}%`, background: colorFor("Careem") }}>
          {segCareem > 8 && (
            <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-black/70 pointer-events-none">{Math.round(segCareem)}%</span>
          )}
        </div>
        <div className="h-full transition-all relative group" style={{ width: `${segCappedTalabat}%`, background: colorFor("Talabat") }}>
          {segCappedTalabat > 8 && (
            <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-white/80 pointer-events-none">{Math.round(segCappedTalabat)}%</span>
          )}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px]">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-sm" style={{ background: colorFor("Careem") }} />
          <span className="text-muted-foreground">Careem</span>
          <span className="text-num font-semibold">{fmtInt(careem?.sales ?? 0)}</span>
          <span className="text-muted-foreground">/ {fmtJOD0(careem?.target ?? 0)}</span>
          <span className="text-num font-semibold" style={{ color: pctColor(careem?.achievement ?? 0) }}>
            {careem && careem.target > 0 ? Math.round(careem.achievement) + "%" : "-"}
          </span>
          <InfoTip id="target_pct" side="top" />
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-sm" style={{ background: colorFor("Talabat") }} />
          <span className="text-muted-foreground">Talabat</span>
          <span className="text-num font-semibold">{fmtInt(talabat?.sales ?? 0)}</span>
          <span className="text-muted-foreground">/ {fmtJOD0(talabat?.target ?? 0)}</span>
          <span className="text-num font-semibold" style={{ color: pctColor(talabat?.achievement ?? 0) }}>
            {talabat && talabat.target > 0 ? Math.round(talabat.achievement) + "%" : "-"}
          </span>
          <InfoTip id="target_pct" side="top" />
        </span>
        <span className="ml-auto text-muted-foreground text-num">
          Combined <span className="text-foreground font-semibold">{fmtInt(pace.totalSales)}</span> / {fmtJOD0(pace.totalTarget)}
        </span>
      </div>
    </div>
  );
}

const tooltipStyle = {
  contentStyle: {
    background: "var(--popover)", border: "1px solid var(--border)",
    borderRadius: 8, fontSize: 12,
  },
  labelStyle: { color: "var(--foreground)" },
};

/** Hollow dot drawn only on the in-progress month of the Total sales trend, so a partial month
 *  reads as awaiting data rather than a completed point. */
function PartialDot(props: { cx?: number; cy?: number; payload?: { partial?: boolean } }) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null || !payload?.partial) return <g />;
  return <circle cx={cx} cy={cy} r={4} fill="var(--card)" stroke="var(--primary)" strokeWidth={2} />;
}

/** Emphasized point on the 3-month floor line, only where the floor steps up (a new higher low). */
function FloorDot(props: { cx?: number; cy?: number; payload?: { floorStepUp?: boolean } }) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null || !payload?.floorStepUp) return <g />;
  return <circle cx={cx} cy={cy} r={4.5} fill="#EEC36A" stroke="var(--card)" strokeWidth={1.5} />;
}

/** Tooltip for the Total sales trend: month, exact combined total, the 3-month average, and the
 *  3-month floor (with a note when it steps up). */
function SalesTrendTooltip({ active, payload }: {
  active?: boolean;
  payload?: { payload: { label: string; total: number; partial: boolean; avg3: number | null; floor: number | null; floorStepUp: boolean; floorPrev: number | null } }[];
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div style={{ ...tooltipStyle.contentStyle, padding: "6px 10px" }}>
      <div style={{ fontWeight: 600, color: "var(--foreground)" }}>
        {p.label}{p.partial ? " (in progress)" : ""}
      </div>
      <div style={{ color: "var(--foreground)" }}>{fmtJOD0(p.total)}</div>
      {p.avg3 != null && <div style={{ color: "#C8B89B" }}>3-month avg {fmtJOD0(p.avg3)}</div>}
      {p.floor != null && <div style={{ color: "var(--muted-foreground)" }}>3-month floor {fmtJOD0(p.floor)}</div>}
      {p.floorStepUp && p.floorPrev != null && (
        <div style={{ color: "#EEC36A", fontWeight: 600 }}>New floor: {fmtJOD0(p.floor as number)}, up from {fmtJOD0(p.floorPrev)}</div>
      )}
    </div>
  );
}

// ---------- math ----------
function pctDelta(cur: number, prev: number) {
  if (!prev || !isFinite(prev)) return null;
  const change = ((cur - prev) / prev) * 100;
  const up = change >= 0;
  return { up, good: up, text: `${up ? "▲" : "▼"} ${Math.abs(change).toFixed(1)}% vs prior period` };
}
function ptDelta(cur: number, prev: number) {
  const change = cur - prev;
  const up = change >= 0;
  return { up, good: up, text: `${up ? "▲" : "▼"} ${Math.abs(change).toFixed(1)}pt vs prior period` };
}
function platformContext(p: PlatformKey) {
  return p === "All" ? "Talabat + Careem" : `${p} only`;
}