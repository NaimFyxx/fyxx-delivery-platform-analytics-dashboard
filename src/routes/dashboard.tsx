import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getDashboardData, type DashboardData } from "@/lib/dashboard.functions";
import fyxxLogo from "@/assets/fyxx-logo-white.svg";
import talabatLogo from "@/assets/talabat-logo.png.asset.json";
import careemLogo from "@/assets/careem-logo.png.asset.json";
import tgrLogo from "@/assets/tgr-logo.png.asset.json";
import {
  Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line, LineChart,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { MonthPicker } from "@/components/fyxx/date-picker";

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

const VAT = 0.16;
const exVat = (v: number) => v / (1 + VAT);
const fmtJOD = (n: number) => `${Math.round(n).toLocaleString()} JOD`;
const fmtPct = (n: number) => `${n.toFixed(1)}%`;

type RangeKey = "this" | "last" | "custom" | "all";
type PlatformKey = "All" | "Talabat" | "Careem";

/** Month string helpers ("YYYY-MM"). */
const monthOfDate = (iso: string) => iso.slice(0, 7);
const lastDayOfMonth = (m: string) => {
  const [y, mm] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mm, 0)).toISOString().slice(0, 10);
};
const prevMonth = (m: string) => {
  const [y, mm] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mm - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
const monthLabel = (m: string) =>
  new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "short", year: "2-digit" });

function monthsBetween(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = from;
  while (cur <= to) { out.push(cur); cur = nextMonth(cur); }
  return out;
}
function nextMonth(m: string) {
  const [y, mm] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mm, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * For one item, return the cost active as of asOfDate (YYYY-MM-DD):
 * the row with the GREATEST effective_from that is <= asOfDate.
 * Returns null if no version was effective yet.
 */
function costAsOf(costs: DashboardData["costs"], item: string, asOfDate: string): number | null {
  let best: { effective_from: string; cost: number } | null = null;
  for (const c of costs) {
    if (c.item !== item) continue;
    if (c.effective_from > asOfDate) continue;
    if (!best || c.effective_from > best.effective_from) best = c;
  }
  return best ? best.cost : null;
}

/** COGS for a (month, platform) using the cost version active during that month. */
function cogsFor(
  itemSales: DashboardData["itemSales"],
  costs: DashboardData["costs"],
  month: string,
  platforms: string[],
): number {
  const asOf = lastDayOfMonth(month);
  let total = 0;
  for (const s of itemSales) {
    if (s.month !== month) continue;
    if (!platforms.includes(s.platform)) continue;
    const c = costAsOf(costs, s.item, asOf);
    if (c != null) total += s.units * c;
  }
  return total;
}

function PublicDashboard() {
  const fetchData = useServerFn(getDashboardData);
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => fetchData(),
    refetchOnWindowFocus: false,
  });

  const [range, setRange] = useState<RangeKey>("all");
  const [platform, setPlatform] = useState<PlatformKey>("All");
  const platforms = platform === "All" ? ["Talabat", "Careem"] : [platform];

  // Reference "today" — derived from the latest daily sales date, falls back to real today.
  const today = useMemo(() => {
    const last = data?.daily.at(-1)?.date;
    return last ?? new Date().toISOString().slice(0, 10);
  }, [data]);
  const currentMonth = monthOfDate(today);

  const [customFrom, setCustomFrom] = useState(currentMonth);
  const [customTo, setCustomTo] = useState(currentMonth);

  // All months that appear anywhere in the data, sorted.
  const allMonths = useMemo(() => {
    if (!data) return [];
    const set = new Set<string>();
    data.daily.forEach((d) => set.add(monthOfDate(d.date)));
    data.financials.forEach((d) => set.add(d.month));
    data.itemSales.forEach((d) => set.add(d.month));
    return Array.from(set).sort();
  }, [data]);

  const rangeMonths: string[] = useMemo(() => {
    if (!allMonths.length) return [];
    if (range === "this") return [currentMonth];
    if (range === "last") return [prevMonth(currentMonth)];
    if (range === "custom") {
      const lo = customFrom <= customTo ? customFrom : customTo;
      const hi = customFrom <= customTo ? customTo : customFrom;
      return monthsBetween(lo, hi);
    }
    return allMonths;
  }, [range, currentMonth, customFrom, customTo, allMonths]);

  const rangeIsSingleMonth = rangeMonths.length === 1;

  // --- Aggregations per month, respecting platform filter ---
  type MonthAgg = { month: string; gross: number; payout: number; cogs: number; orders: number };
  const monthAggs: MonthAgg[] = useMemo(() => {
    if (!data) return [];
    return rangeMonths.map((m) => {
      const finRows = data.financials.filter((f) => f.month === m && platforms.includes(f.platform));
      const finGross = finRows.reduce((s, r) => s + r.gross, 0);
      const payout = finRows.reduce((s, r) => s + r.payout, 0);
      // Prefer monthly_financials.gross; fall back to summed daily_sales for that month.
      const dailyRows = data.daily
        .filter((d) => monthOfDate(d.date) === m && platforms.includes(d.platform))
      const dailyGross = dailyRows.reduce((s, d) => s + d.sales, 0);
      const orders = dailyRows.reduce((s, d) => s + (d.orders ?? 0), 0);
      const gross = finGross > 0 ? finGross : dailyGross;
      const cogs = cogsFor(data.itemSales, data.costs, m, platforms);
      return { month: m, gross, payout, cogs, orders };
    });
  }, [data, rangeMonths, platforms]);

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
      const dailyRows = data.daily
        .filter((d) => monthOfDate(d.date) === m && platforms.includes(d.platform))
      const dailyGross = dailyRows.reduce((s, d) => s + d.sales, 0);
      const orders = dailyRows.reduce((s, d) => s + (d.orders ?? 0), 0);
      const gross = finGross > 0 ? finGross : dailyGross;
      const cogs = cogsFor(data.itemSales, data.costs, m, platforms);
      return { month: m, gross, payout, cogs, orders };
    });
  }, [data, range, rangeMonths, platforms, allMonths]);

  const totals = useMemo(() => sum(monthAggs), [monthAggs]);
  const priorTotals = useMemo(() => (priorAggs ? sum(priorAggs) : null), [priorAggs]);

  // All-time totals (ignore filters — everything since day one)
  const allTime = useMemo(() => {
    if (!data) return { sales: 0, orders: 0 };
    return data.daily.reduce(
      (acc, d) => ({ sales: acc.sales + d.sales, orders: acc.orders + (d.orders ?? 0) }),
      { sales: 0, orders: 0 },
    );
  }, [data]);

  const kpis = computeKpis(totals);
  const priorKpis = priorTotals ? computeKpis(priorTotals) : null;

  // --- Pace tracker: always current month, ignores range filter ---
  const pace = useMemo(() => {
    if (!data) return null;
    const mtd = data.daily
      .filter((d) => monthOfDate(d.date) === currentMonth && platforms.includes(d.platform))
      .reduce((s, d) => s + d.sales, 0);
    const target = data.targets
      .filter((t) => t.month === currentMonth && platforms.includes(t.platform))
      .reduce((s, t) => s + t.salesTarget, 0);
    const dayOfMonth = Number(today.slice(8, 10));
    const [y, mm] = currentMonth.split("-").map(Number);
    const daysInMonth = new Date(Date.UTC(y, mm, 0)).getUTCDate();
    const proRated = target * (dayOfMonth / daysInMonth);
    const achievement = proRated ? (mtd / proRated) * 100 : 0;
    return { mtd, target, proRated, achievement, dayOfMonth, daysInMonth };
  }, [data, currentMonth, today, platforms]);

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
        const prod = gross ? ((exVat(gross) - cogs) / exVat(gross)) * 100 : 0;
        const net = payout ? ((exVat(payout) - cogs) / exVat(payout)) * 100 : 0;
        arr.push({
          label: `${monthLabel(m).split(" ")[0]} ${d}`,
          Talabat: v.Talabat, Careem: v.Careem,
          gross, prod, net, profit: exVat(payout) - cogs,
          drag: prod - net, target: 45,
        });
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
      const prod = agg.gross ? ((exVat(agg.gross) - agg.cogs) / exVat(agg.gross)) * 100 : 0;
      const net = agg.payout ? ((exVat(agg.payout) - agg.cogs) / exVat(agg.payout)) * 100 : 0;
      const profit = exVat(agg.payout) - agg.cogs;
      return {
        label: monthLabel(m),
        Talabat: platforms.includes("Talabat") ? talabat : 0,
        Careem: platforms.includes("Careem") ? careem : 0,
        gross: agg.gross, prod, net, profit, drag: prod - net, target: 45,
      };
    });
  }, [data, rangeIsSingleMonth, rangeMonths, monthAggs, platforms, currentMonth, today]);

  if (isLoading || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Loading dashboard…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Header today={today} lastDailyDate={data.daily.at(-1)?.date ?? null} allTime={allTime} />

      <div className="max-w-[1180px] mx-auto px-7 pt-7 pb-20">
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
              <div className="w-36"><MonthPicker value={customFrom} onChange={setCustomFrom} /></div>
              <label className="text-muted-foreground">To</label>
              <div className="w-36"><MonthPicker value={customTo} onChange={setCustomTo} /></div>
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

        {/* PACE TRACKER */}
        <SectionLabel>Current Month — Live Pace</SectionLabel>
        <div className="rounded-2xl border border-border p-5 mb-4"
             style={{ background: "linear-gradient(135deg, #0b2222, #0f2c2c)" }}>
          <div className="flex items-start justify-between mb-2">
            <div>
              <h3 className="font-display text-base font-semibold">
                {monthLabel(currentMonth)} Pace vs Target · {platform === "All" ? "Combined" : platform}
              </h3>
              <div className="text-xs text-muted-foreground mt-1">
                Day {pace?.dayOfMonth} of {pace?.daysInMonth} · current month
              </div>
            </div>
            <div className="text-right">
              <div className="font-display text-[38px] font-bold leading-none"
                   style={{ color: (pace?.achievement ?? 0) >= 100 ? "var(--careem)" : "var(--primary)" }}>
                {pace?.target ? Math.round(pace.achievement) + "%" : "—"}
              </div>
              <div className="text-xs text-muted-foreground mt-1">of pro-rated target</div>
            </div>
          </div>
          <div className="h-2.5 bg-background rounded-md overflow-hidden mt-3">
            <div
              className="h-full rounded-md transition-all"
              style={{
                width: `${Math.min(pace?.achievement ?? 0, 100)}%`,
                background: "linear-gradient(90deg, var(--careem), var(--primary))",
              }}
            />
          </div>
          <div className="flex justify-between mt-2.5 text-[11px] text-muted-foreground">
            <span>
              {pace?.target
                ? `Actual MTD: ${Math.round(pace.mtd)} JOD · pro-rated target ${Math.round(pace.proRated)}`
                : "No target set for this month"}
            </span>
            <span>
              {pace?.target ? `Full ${monthLabel(currentMonth)} target: ${pace.target.toLocaleString()} JOD` : ""}
            </span>
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mb-4">
          <Kpi label="Sales (incl VAT)" value={`${Math.round(kpis.gross).toLocaleString()}`} unit="JOD"
               delta={priorKpis ? pctDelta(kpis.gross, priorKpis.gross) : null}
               prior={priorKpis ? `Prior: ${Math.round(priorKpis.gross).toLocaleString()} JOD` : platformContext(platform)} />
          <Kpi label="Product Margin" value={kpis.prodMargin.toFixed(1)} unit="%"
               delta={priorKpis ? ptDelta(kpis.prodMargin, priorKpis.prodMargin) : null}
               prior={priorKpis ? `Prior: ${priorKpis.prodMargin.toFixed(1)}%` : "on menu price exVAT"} />
          <Kpi label="Net Margin · after commission" value={kpis.netMargin.toFixed(1)} unit="%"
               delta={priorKpis ? ptDelta(kpis.netMargin, priorKpis.netMargin) : null}
               prior={priorKpis ? `Prior: ${priorKpis.netMargin.toFixed(1)}%` : "on payout exVAT"} />
          <Kpi label="Net Profit Kept" value={`${Math.round(kpis.netProfit).toLocaleString()}`} unit="JOD"
               delta={priorKpis ? pctDelta(kpis.netProfit, priorKpis.netProfit) : null}
               prior={priorKpis ? `Prior: ${Math.round(priorKpis.netProfit).toLocaleString()} JOD` : "payout exVAT − cost"} />
        </div>

        <SectionLabel>Analytics — Controlled by the Range &amp; Platform Filters Above</SectionLabel>
        <div className="grid lg:grid-cols-2 gap-3.5">
          <ChartCard title="Sales by Platform" sub={rangeIsSingleMonth ? "Daily gross sales incl VAT" : "Gross sales incl VAT"}>
            <ResponsiveContainer>
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip {...tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {platforms.includes("Talabat") && <Bar dataKey="Talabat" stackId={rangeIsSingleMonth ? "a" : undefined} fill="var(--talabat)" radius={[3, 3, 0, 0]} />}
                {platforms.includes("Careem") && <Bar dataKey="Careem" stackId={rangeIsSingleMonth ? "a" : undefined} fill="var(--careem)" radius={[3, 3, 0, 0]} />}
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
          <ChartCard title="Two Margins Compared" sub="Product margin vs what you keep after the platform's cut">
            <ResponsiveContainer>
              <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false}
                       tickFormatter={(v) => `${v}%`} domain={[0, 55]} />
                <Tooltip {...tooltipStyle} formatter={(v: number) => `${v.toFixed(1)}%`} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <ReferenceLine y={45} stroke="var(--muted-foreground)" strokeDasharray="6 4" label={{ value: "Target 45%", fill: "var(--muted-foreground)", fontSize: 10, position: "insideTopRight" }} />
                <Line type="monotone" dataKey="prod" name="Product margin %" stroke="var(--primary)" strokeWidth={2} dot={{ r: 3, fill: "var(--primary)" }} />
                <Line type="monotone" dataKey="net" name="Net margin after commission %" stroke="var(--careem)" strokeWidth={2} dot={{ r: 3, fill: "var(--careem)" }} />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        <SectionLabel>Profitability Detail</SectionLabel>
        <div className="grid lg:grid-cols-2 gap-3.5">
          <ChartCard title="Net Profit Kept (JOD)" sub="Actual payout exVAT − cost of goods · what lands with you">
            <ResponsiveContainer>
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                <Tooltip {...tooltipStyle} formatter={(v: number) => `${Math.round(v)} JOD`} />
                <Bar dataKey="profit" fill="rgba(63,209,122,0.8)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
          <ChartCard title="The Commission Drag" sub="Margin points lost to platform fees">
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
  );
}

// ---------- small UI primitives ----------
function Header({
  today, lastDailyDate, allTime,
}: {
  today: string;
  lastDailyDate: string | null;
  allTime: { sales: number; orders: number };
}) {
  const fresh = useFreshness(today, lastDailyDate);
  return (
    <div className="flex items-center justify-between px-7 py-4 border-b border-border bg-card sticky top-0 z-50">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3">
          <img src={fyxxLogo} alt="Fyxx" className="h-8 w-auto" />
          <span className="text-muted-foreground text-xs">×</span>
          <img src={talabatLogo.url} alt="talabat" className="h-5 w-auto" />
          <span className="text-muted-foreground text-xs">×</span>
          <img src={careemLogo.url} alt="Careem" className="h-5 w-auto" />
          <span className="text-muted-foreground text-xs">×</span>
          <img src={tgrLogo.url} alt="The Green Room" className="h-8 w-auto" />
        </div>
        <div>
          <h1 className="font-display text-[17px] font-semibold leading-none">The Green Room — Delivery Dashboard</h1>
          <div className="text-[10px] text-muted-foreground mt-1">Talabat &amp; Careem · shareable read-only link</div>
        </div>
      </div>
      <div className="text-right">
        <div className="flex items-center justify-end gap-1.5 text-[11px]">
          <span className="inline-block w-2 h-2 rounded-full animate-pulse" style={{ background: fresh.color }} />
          <span style={{ color: fresh.color }}>{fresh.text}</span>
        </div>
        <div className="flex items-center justify-end gap-2 mt-1.5">
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-[#0f2c2c] border border-[#1a3a3a]" style={{ color: "var(--careem)" }}>
            All-time sales: {Math.round(allTime.sales).toLocaleString()} JOD
          </span>
          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-[#0f2c2c] border border-[#1a3a3a]" style={{ color: "var(--primary)" }}>
            Orders: {allTime.orders.toLocaleString()}
          </span>
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

function Segmented<T extends string>({
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
          platform && o.v === "Talabat" ? "#fff" :
          platform && o.v === "Careem" ? "#06251a" :
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

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] uppercase tracking-[1px] font-bold mt-6 mb-3" style={{ color: "var(--primary)" }}>
      {children}
    </div>
  );
}

function Kpi({
  label, value, unit, delta, prior,
}: {
  label: string;
  value: string;
  unit: string;
  delta: { up: boolean; text: string; good: boolean } | null;
  prior: string;
}) {
  const deltaColor = !delta ? "var(--muted-foreground)" : delta.good ? "var(--careem)" : "var(--destructive)";
  return (
    <div className="bg-card border border-border rounded-2xl p-4">
      <div className="text-[9.5px] uppercase tracking-[0.8px] font-semibold text-muted-foreground">{label}</div>
      <div className="font-display text-[25px] font-semibold mt-1.5">
        {value} <span className="text-[13px] text-muted-foreground">{unit}</span>
      </div>
      <div className="text-[10.5px] font-semibold mt-1" style={{ color: deltaColor }}>
        {delta ? delta.text : "no prior period"}
      </div>
      <div className="text-[10px] text-muted-foreground mt-1.5 pt-1.5 border-t border-border">{prior}</div>
    </div>
  );
}

function ChartCard({ title, sub, children }: { title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4">
      <h3 className="font-display text-[15px] font-semibold">{title}</h3>
      <div className="text-[10.5px] text-muted-foreground mb-3">{sub}</div>
      <div className="h-[230px]">{children}</div>
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
function sum(rows: { gross: number; payout: number; cogs: number; orders: number }[]) {
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
function computeKpis(t: { gross: number; payout: number; cogs: number; orders: number }) {
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