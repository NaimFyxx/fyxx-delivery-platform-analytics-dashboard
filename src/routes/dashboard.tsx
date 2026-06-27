import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AdminShell } from "@/components/fyxx/admin-sidebar";
import { InfoTip } from "@/components/fyxx/info-tip";
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
import { cogsFor } from "@/lib/costs";
import { exVat, fmtJOD0, fmtInt, platformsFromFilter, type PlatformKey } from "@/lib/fyxx";
import { monthOfDate, monthLabel, type RangeKey } from "@/lib/months";
import { useRangeFilter } from "@/hooks/use-range-filter";
// Re-exported so other routes keep importing these from here.
export { costAsOf, cogsFor } from "@/lib/costs";
export { exVat } from "@/lib/fyxx";
export { monthOfDate, lastDayOfMonth, prevMonth, monthLabel, monthsBetween, nextMonth, type RangeKey } from "@/lib/months";
export { type PlatformKey, platformsFromFilter } from "@/lib/fyxx";

export const Route = createFileRoute("/dashboard")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "The Green Room — Delivery Dashboard" },
      { name: "description", content: "Live Talabat & Careem performance for The Green Room. Shareable read-only." },
      { property: "og:title", content: "The Green Room — Delivery Dashboard" },
      { property: "og:description", content: "Live Talabat & Careem performance for The Green Room." },
    ],
  }),
  component: PublicDashboard,
});

export type MonthAgg = { month: string; gross: number; payout: number; discount: number; cogs: number; orders: number };

function PublicDashboard() {
  const { adminUser, sessionChecked, handleSignOut } = useSoftGate();

  const fetchData = useServerFn(getDashboardData);
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => fetchData(),
    refetchOnWindowFocus: false,
  });

  const [platform, setPlatform] = useState<PlatformKey>("All");
  const platforms: string[] = platformsFromFilter(platform);

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

  const { range, setRange, customFrom, customTo, handleCustomFrom, handleCustomTo, rangeMonths, rangeIsSingleMonth } =
    useRangeFilter({ allMonths, today });

  // --- Aggregations per month, respecting platform filter ---
  const monthAggs: MonthAgg[] = useMemo(() => {
    if (!data) return [];
    return rangeMonths.map((m) => {
      const finRows = data.financials.filter((f) => f.month === m && platforms.includes(f.platform));
      const finGross = finRows.reduce((s, r) => s + r.gross, 0);
      const payout = finRows.reduce((s, r) => s + r.payout, 0);
      const discount = finRows.reduce((s, r) => s + r.discount, 0);
      // Prefer monthly_financials.gross; fall back to summed daily_sales for that month.
      const dailyRows = data.daily
        .filter((d) => monthOfDate(d.date) === m && platforms.includes(d.platform))
      const dailyGross = dailyRows.reduce((s, d) => s + d.sales, 0);
      const orders = dailyRows.reduce((s, d) => s + (d.orders ?? 0), 0);
      const gross = finGross > 0 ? finGross : dailyGross;
      const cogs = cogsFor(data.itemSales, data.costs, m, platforms);
      return { month: m, gross, payout, discount, cogs, orders };
    });
  }, [data, rangeMonths, platforms]);

  // Full-history month aggs — same logic but over ALL months (not rangeMonths).
  // Used by the trend charts so they always show the complete timeline regardless of the date pills.
  const allMonthAggs: MonthAgg[] = useMemo(() => {
    if (!data) return [];
    return allMonths.map((m) => {
      const finRows = data.financials.filter((f) => f.month === m && platforms.includes(f.platform));
      const finGross = finRows.reduce((s, r) => s + r.gross, 0);
      const payout = finRows.reduce((s, r) => s + r.payout, 0);
      const discount = finRows.reduce((s, r) => s + r.discount, 0);
      const dailyRows = data.daily.filter((d) => monthOfDate(d.date) === m && platforms.includes(d.platform));
      const dailyGross = dailyRows.reduce((s, d) => s + d.sales, 0);
      const orders = dailyRows.reduce((s, d) => s + (d.orders ?? 0), 0);
      const gross = finGross > 0 ? finGross : dailyGross;
      const cogs = cogsFor(data.itemSales, data.costs, m, platforms);
      return { month: m, gross, payout, discount, cogs, orders };
    });
  }, [data, allMonths, platforms]);

  // Prior equal-length period totals (for KPI deltas).
  const priorAggs: MonthAgg[] | null = useMemo(() => {
    if (!data || !rangeMonths.length) return null;
    if (range === "all") return null;
    const len = rangeMonths.length;
    const firstIdx = allMonths.indexOf(rangeMonths[0]);
    if (firstIdx === -1 || firstIdx < len) return null;
    const priorMonths = allMonths.slice(firstIdx - len, firstIdx);
    return priorMonths.map((m) => {
      const finRows = data.financials.filter((f) => f.month === m && platforms.includes(f.platform));
      const finGross = finRows.reduce((s, r) => s + r.gross, 0);
      const payout = finRows.reduce((s, r) => s + r.payout, 0);
      const discount = finRows.reduce((s, r) => s + r.discount, 0);
      const dailyRows = data.daily
        .filter((d) => monthOfDate(d.date) === m && platforms.includes(d.platform))
      const dailyGross = dailyRows.reduce((s, d) => s + d.sales, 0);
      const orders = dailyRows.reduce((s, d) => s + (d.orders ?? 0), 0);
      const gross = finGross > 0 ? finGross : dailyGross;
      const cogs = cogsFor(data.itemSales, data.costs, m, platforms);
      return { month: m, gross, payout, discount, cogs, orders };
    });
  }, [data, range, rangeMonths, platforms, allMonths]);

  const totals = useMemo(() => sum(monthAggs), [monthAggs]);
  const priorTotals = useMemo(() => (priorAggs ? sum(priorAggs) : null), [priorAggs]);

  // All-time totals (ignore filters — everything since day one)
  const kpis = computeKpis(totals);
  const priorKpis = priorTotals ? computeKpis(priorTotals) : null;

  // Margin % with a near-zero denominator guard and outlier clamp.
  // Returns null so Recharts gaps the line rather than spiking off-scale.
  function pct(numer: number, denom: number): number | null {
    if (denom < 1) return null; // < 1 JOD is too noisy to divide
    const v = (numer / denom) * 100;
    return v < -500 || v > 500 ? null : v;
  }

  // Monthly margin series — always uses ALL months (not rangeMonths) so the trend chart never
  // blanks when a single month is selected. Platform filter still applies via allMonthAggs.
  const marginTrend = useMemo(
    () =>
      allMonthAggs.map((a, i, arr) => {
        const win = arr.slice(Math.max(0, i - 2), i + 1);
        const trailEnough = win.length >= 2;
        const validProds = win.map((w) => pct(exVat(w.gross) - w.cogs, exVat(w.gross))).filter((v): v is number => v !== null);
        const validComms = win.map((w) => pct(exVat(w.payout + w.discount) - w.cogs, exVat(w.payout + w.discount))).filter((v): v is number => v !== null);
        const validNets = win.map((w) => pct(exVat(w.payout) - w.cogs, exVat(w.payout))).filter((v): v is number => v !== null);
        return {
          label: monthLabel(a.month),
          prod: pct(exVat(a.gross) - a.cogs, exVat(a.gross)),
          comm: pct(exVat(a.payout + a.discount) - a.cogs, exVat(a.payout + a.discount)),
          net: pct(exVat(a.payout) - a.cogs, exVat(a.payout)),
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

  // --- Pace tracker: always current month, ignores range filter ---
  const pace = useMemo(() => data ? computePace(data, currentMonth, today) : null, [data, currentMonth, today]);

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
      // Monthly totals for ratio-based payout/cost approximation
      const agg = monthAggs[0];
      const grossTotal = Object.values(byDay).reduce((s, v) => s + v.Talabat + v.Careem, 0);
      const payoutRatio = grossTotal > 0 ? agg.payout / grossTotal : 0;
      const costRatio = grossTotal > 0 ? agg.cogs / exVat(grossTotal) : 0;
      const arr = [];
      for (let d = 1; d <= endDay; d++) {
        const v = byDay[d] ?? { Talabat: 0, Careem: 0 };
        const gross = v.Talabat + v.Careem;
        const payout = gross * payoutRatio;
        const cogs = exVat(gross) * costRatio;
        const prod = pct(exVat(gross) - cogs, exVat(gross));
        const net = pct(exVat(payout) - cogs, exVat(payout));
        arr.push({
          label: `${monthLabel(m).split(" ")[0]} ${d}`,
          Talabat: v.Talabat, Careem: v.Careem,
          gross, prod, net, profit: exVat(payout) - cogs,
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
      const prod = pct(exVat(agg.gross) - agg.cogs, exVat(agg.gross));
      const net = pct(exVat(agg.payout) - agg.cogs, exVat(agg.payout));
      const profit = exVat(agg.payout) - agg.cogs;
      return {
        label: monthLabel(m),
        Talabat: platforms.includes("Talabat") ? talabat : 0,
        Careem: platforms.includes("Careem") ? careem : 0,
        gross: agg.gross, prod, net, profit,
        drag: prod != null && net != null ? prod - net : null, target: 45,
      };
    });
  }, [data, rangeIsSingleMonth, rangeMonths, monthAggs, platforms, currentMonth, today]);

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
      <Header today={today} lastDailyDate={data.daily.at(-1)?.date ?? null} showNav={!adminUser} />

      <div className="max-w-[1180px] mx-auto px-4 md:px-7 pt-5 md:pt-7 pb-20">
        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center mb-5">
          <Segmented
            options={[
              { v: "this", l: "This Month" },
              { v: "last", l: "Last Month" },
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

        {/* PACE TRACKER — always current month, always all platforms, ignores all filters */}
        <PaceTracker pace={pace} currentMonth={currentMonth} />

        {/* KPI cards */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5 mb-4">
          <Kpi label="Sales (incl VAT)" value={fmtInt(kpis.gross)} unit="JOD"
               delta={priorKpis ? pctDelta(kpis.gross, priorKpis.gross) : null}
               prior={priorKpis ? `Prior: ${fmtJOD0(priorKpis.gross)}` : platformContext(platform)}
               sub={`avg ${fmtJOD0(kpis.gross / activeDays)}/day`}
               infoId="sales_incl_vat" />
          <Kpi label="Avg Basket (AOV)" value={kpis.aov ? kpis.aov.toFixed(2) : "—"} unit="JOD"
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

        <SectionLabel>Analytics — Controlled by the Range &amp; Platform Filters Above</SectionLabel>
        <ChartCard title="Sales by Platform" sub={rangeIsSingleMonth ? "Daily gross sales incl VAT" : "Gross sales incl VAT"} infoId="chart_sales_by_platform">
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

        {allMonthAggs.length >= 2 && (
          <>
            <SectionLabel>Margin Trend · Monthly</SectionLabel>
            <ChartCard
              title="Margin over Time"
              sub="Product → After commission → Net margin — full monthly history; not affected by the date filter above"
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
              sub="Avg orders/day (left) vs avg sales/day JOD (right) — full history; not affected by the date filter above"
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
          <ChartCard title="The Commission Drag" sub="Margin points lost to platform fees" infoId="chart_commission_drag">
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
          </ChartCard>
        </div>

        <div className="mt-8 pt-4 border-t border-border text-[10px] text-muted-foreground text-center">
          The Green Room × Talabat &amp; Careem · Margins VAT-stripped per Zeid's formula · Public read-only ·{" "}
          <Link to="/auth" className="underline hover:text-foreground">Admin sign in</Link>
        </div>
      </div>
    </div>
    </AdminShell>
  );
}

// ---------- small UI primitives ----------
export function Header({
  today, lastDailyDate, showNav = true,
}: {
  today: string;
  lastDailyDate: string | null;
  showNav?: boolean;
}) {
  const fresh = useFreshness(today, lastDailyDate);
  return (
    <div className="border-b border-border bg-card sticky top-0 z-50">
      {/* Mobile: two compact rows */}
      <div className="flex md:hidden flex-col px-4 py-2.5 gap-1.5">
        <div className="flex items-center justify-between">
          <img src={tgrLogoDark} alt="The Green Room" className="h-8 w-auto" />
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
        </div>
        <div className="flex items-center justify-between gap-2">
          <h1 className="font-display text-[14px] font-semibold leading-none">The Green Room</h1>
          <div className="flex items-center gap-1 text-[10px] shrink-0">
            <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: fresh.color }} />
            <span style={{ color: fresh.color }}>{fresh.text}</span>
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
            <h1 className="font-display text-[17px] font-semibold leading-none truncate">The Green Room — Delivery Dashboard</h1>
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
  return { text: `⚠ Stale — last update ${days} days ago (${nice})`, color: "var(--destructive)" };
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

function ChartCard({ title, sub, children, action, infoId }: { title: string; sub: string; children: React.ReactNode; action?: React.ReactNode; infoId?: string }) {
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
    data.daily
      .filter((d) => monthOfDate(d.date) === currentMonth && d.date <= today)
      .map((d) => d.date),
  );
  const workingDay = workingDates.size;

  const platformsOnSheet: ("Talabat" | "Careem")[] = ["Talabat", "Careem"];
  const rows = platformsOnSheet.map((p) => {
    const sales = data.daily
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
    const dates = data.daily
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

export function PaceTracker({ pace, currentMonth }: {
  pace: PaceData | null; currentMonth: string;
}) {
  if (!pace) return null;
  const colorFor = (p: "Talabat" | "Careem") => p === "Talabat" ? "#FF5A00" : "#1BD15D";
  const pctColor = (n: number) => n >= 100 ? "var(--careem)" : "#f5b400";
  const careem = pace.rows.find((r) => r.platform === "Careem");
  const talabat = pace.rows.find((r) => r.platform === "Talabat");

  // Segments of the combined bar (against the combined target).
  const segCareem  = pace.totalTarget > 0 ? Math.min((careem?.sales  ?? 0) / pace.totalTarget * 100, 100) : 0;
  const segTalabat = pace.totalTarget > 0 ? Math.min((talabat?.sales ?? 0) / pace.totalTarget * 100, 100) : 0;
  const segCappedTalabat = Math.max(0, Math.min(segTalabat, 100 - segCareem));

  return (
    <div className="rounded-2xl border border-border bg-card p-4 mb-4 shadow-sm">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <h3 className="font-display text-sm font-semibold whitespace-nowrap">
            {monthLabel(currentMonth)} pace · Combined
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
        </div>
        <div className="text-right leading-none">
          <span className="font-display text-[26px] font-bold align-middle"
                style={{ color: pctColor(pace.totalAchievement) }}>
            {pace.totalTarget ? Math.round(pace.totalAchievement) + "%" : "—"}
          </span>
          <InfoTip id="pace_pct" side="bottom" />
          <span className="ml-2 text-[10.5px] text-muted-foreground align-middle">
            {pace.totalTarget ? `pro-rated ${Math.round(pace.proRatedAch)}%` : "no target set"}
          </span>
          {pace.totalTarget > 0 && <InfoTip id="pace_prorated" side="bottom" />}
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
            <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-white/80 pointer-events-none">{Math.round(segTalabat)}%</span>
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
            {careem && careem.target > 0 ? Math.round(careem.achievement) + "%" : "—"}
          </span>
          <InfoTip id="target_pct" side="top" />
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-sm" style={{ background: colorFor("Talabat") }} />
          <span className="text-muted-foreground">Talabat</span>
          <span className="text-num font-semibold">{fmtInt(talabat?.sales ?? 0)}</span>
          <span className="text-muted-foreground">/ {fmtJOD0(talabat?.target ?? 0)}</span>
          <span className="text-num font-semibold" style={{ color: pctColor(talabat?.achievement ?? 0) }}>
            {talabat && talabat.target > 0 ? Math.round(talabat.achievement) + "%" : "—"}
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

// ---------- math ----------
export function sum(rows: { gross: number; payout: number; cogs: number; orders: number }[]) {
  return rows.reduce(
    (acc, r) => ({
      gross: acc.gross + r.gross,
      payout: acc.payout + r.payout,
      cogs: acc.cogs + r.cogs,
      orders: acc.orders + r.orders,
    }),
    { gross: 0, payout: 0, cogs: 0, orders: 0 },
  );
}
export function computeKpis(t: { gross: number; payout: number; cogs: number; orders: number }) {
  const prodMargin = t.gross > 0 ? ((exVat(t.gross) - t.cogs) / exVat(t.gross)) * 100 : 0;
  const netMargin = t.payout > 0 ? ((exVat(t.payout) - t.cogs) / exVat(t.payout)) * 100 : 0;
  const netProfit = exVat(t.payout) - t.cogs;
  const aov = t.orders > 0 ? t.gross / t.orders : 0;
  return { gross: t.gross, payout: t.payout, cogs: t.cogs, orders: t.orders, prodMargin, netMargin, netProfit, aov };
}
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