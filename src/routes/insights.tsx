import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getDashboardData } from "@/lib/dashboard.functions";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
} from "recharts";
import { MonthPicker } from "@/components/fyxx/date-picker";
import {
  Header,
  Segmented,
  SectionLabel,
  monthOfDate,
  prevMonth,
  monthLabel,
  monthsBetween,
  costAsOf,
  type RangeKey,
  type PlatformKey,
} from "./dashboard";

export const Route = createFileRoute("/insights")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Insights — The Green Room" },
      {
        name: "description",
        content: "Item-level, top product, and Careem+ / Talabat Pro tier insights.",
      },
    ],
  }),
  component: InsightsPage,
});

type SortKey = "item" | "units" | "revenue" | "cogs" | "cost" | "margin";

function InsightsPage() {
  const fetchData = useServerFn(getDashboardData);
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => fetchData(),
    refetchOnWindowFocus: false,
  });

  const [range, setRange] = useState<RangeKey>("this");
  const [platform, setPlatform] = useState<PlatformKey>("All");
  const platforms = platform === "All" ? ["Talabat", "Careem"] : [platform];

  const today = useMemo(() => {
    const last = data?.daily.at(-1)?.date;
    return last ?? new Date().toISOString().slice(0, 10);
  }, [data]);
  const currentMonth = monthOfDate(today);

  const [customFrom, setCustomFrom] = useState(currentMonth);
  const [customTo, setCustomTo] = useState(currentMonth);

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

  const [sortBy, setSortBy] = useState<SortKey>("revenue");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // --- Per-item aggregation across selected months + platforms ---
  const items = useMemo(() => {
    if (!data) return [];
    const map = new Map<
      string,
      { item: string; units: number; revenue: number; cogs: number; lastCost: number | null }
    >();
    for (const s of data.itemSales) {
      if (!rangeMonths.includes(s.month)) continue;
      if (!platforms.includes(s.platform)) continue;
      const asOf = `${s.month}-28`;
      const c = costAsOf(data.costs, s.item, asOf);
      const row = map.get(s.item) ?? {
        item: s.item,
        units: 0,
        revenue: 0,
        cogs: 0,
        lastCost: null,
      };
      row.units += s.units;
      row.revenue += s.revenue ?? 0;
      if (c != null) {
        row.cogs += s.units * c;
        row.lastCost = c;
      }
      map.set(s.item, row);
    }
    const rows = Array.from(map.values()).map((r) => ({
      ...r,
      margin:
        r.revenue > 0 ? ((r.revenue / (1 + 0.16) - r.cogs) / (r.revenue / (1 + 0.16))) * 100 : 0,
    }));
    rows.sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortBy === "item") return a.item.localeCompare(b.item) * dir;
      if (sortBy === "units") return (a.units - b.units) * dir;
      if (sortBy === "revenue") return (a.revenue - b.revenue) * dir;
      if (sortBy === "cogs") return (a.cogs - b.cogs) * dir;
      if (sortBy === "margin") return (a.margin - b.margin) * dir;
      return ((a.lastCost ?? 0) - (b.lastCost ?? 0)) * dir;
    });
    return rows;
  }, [data, rangeMonths, platforms, sortBy, sortDir]);

  const anyRevenue = useMemo(() => items.some((r) => r.revenue > 0), [items]);
  const topProducts = useMemo(
    () =>
      [...items]
        .sort((a, b) => (anyRevenue ? b.revenue - a.revenue : b.units - a.units))
        .slice(0, 10),
    [items, anyRevenue],
  );

  // --- Tiers: subscriber (Careem+ / Talabat Pro) vs regular over selected range ---
  const careemTiers = useMemo(
    () =>
      buildTiers(
        data?.daily,
        "Careem",
        rangeMonths,
        (r) => r.cplusSales ?? 0,
        (r) => r.cplusOrders ?? 0,
      ),
    [data, rangeMonths],
  );
  const talabatTiers = useMemo(
    () =>
      buildTiers(
        data?.daily,
        "Talabat",
        rangeMonths,
        (r) => r.proSales ?? 0,
        (r) => r.proOrders ?? 0,
      ),
    [data, rangeMonths],
  );

  // --- Freshness lookups from import_log ---
  const freshness = useMemo(() => {
    const find = (predicate: (i: { platform: string; reportType: string }) => boolean) => {
      const row = data?.imports.find(predicate);
      return row
        ? new Date(row.importedAt).toLocaleDateString("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
          })
        : null;
    };
    const dailyTypes = [
      "talabat:performance",
      "careem:order_level",
      "careem:plus_orders",
      "careem:plus_sales",
    ];
    const itemTypes = ["talabat:order_report", "careem:menu_item"];
    const finTypes = ["talabat:order_report", "careem:order_level", "careem:adjustments"];
    return {
      daily: find(
        (i) => dailyTypes.includes(i.reportType) && (platform === "All" || i.platform === platform),
      ),
      items: find((i) => itemTypes.includes(i.reportType)),
      invoice: find((i) => finTypes.includes(i.reportType)),
    };
  }, [data, platform]);

  if (isLoading || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Loading insights…
      </div>
    );
  }

  // Use monthly_financials for sales — same source as the dashboard pill.
  const allTime = {
    sales: data.financials.reduce((s, r) => s + r.gross, 0),
    orders: data.daily.reduce((s, d) => s + (d.orders ?? 0), 0),
  };

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
              <div className="w-36">
                <MonthPicker value={customFrom} onChange={setCustomFrom} />
              </div>
              <label className="text-muted-foreground">To</label>
              <div className="w-36">
                <MonthPicker value={customTo} onChange={setCustomTo} />
              </div>
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
          <div className="ml-auto text-[10.5px] text-muted-foreground">
            Range:{" "}
            {rangeMonths.length === 1 ? monthLabel(rangeMonths[0]) : `${rangeMonths.length} months`}
          </div>
        </div>

        {/* CUSTOMER TIERS — prominent */}
        <SectionLabel>Customer Tiers — Careem+ &amp; Talabat Pro</SectionLabel>
        <div className="grid lg:grid-cols-2 gap-3.5 mb-2">
          <TierCard
            title="Careem+ vs Regular"
            sub="Share of sales, orders & AOV for Careem subscribers"
            asOf={freshness.daily}
            bg="linear-gradient(135deg, #0a3d2b, #0f5c3e)"
          >
            {!careemTiers ? (
              <Empty text="No Careem data in this range." />
            ) : !careemTiers.hasSub ? (
              <Empty text="No Careem+ figures imported for this range. Import the Careem Plus — Orders and Sales files." />
            ) : (
              <TierBody t={careemTiers} subLabel="C+" colorVar="var(--careem)" barColor="#5fd0a3" />
            )}
          </TierCard>
          <TierCard
            title="Talabat Pro"
            sub="Pro subscriber share for Talabat orders"
            asOf={freshness.daily}
            bg="linear-gradient(135deg, #5c1f00, #8a2f00)"
          >
            {!talabatTiers ? (
              <Empty text="No Talabat data in this range." />
            ) : !talabatTiers.hasSub ? (
              <Empty text="No Talabat Pro figures imported for this range. Import the Performance Report with the Pro Orders / Pro Revenue columns." />
            ) : (
              <TierBody t={talabatTiers} subLabel="Pro" colorVar="var(--talabat)" barColor="#ff8c42" />
            )}
          </TierCard>
        </div>

        {/* TOP PRODUCTS */}
        <SectionLabel>Top Products — Ranked by Units Sold</SectionLabel>
        <Panel
          title="Top 10 items"
          sub={
            anyRevenue
              ? "Ranked by revenue (JOD) from popular-dishes / gross-breakdown imports."
              : "Ranked by units — no revenue values imported yet. Re-import with the Revenue column mapped to populate."
          }
          asOf={freshness.items}
        >
          <div className="h-[320px]">
            {topProducts.length === 0 ? (
              <Empty text="No item-level data for this range." />
            ) : (
              <ResponsiveContainer>
                <BarChart
                  data={topProducts}
                  layout="vertical"
                  margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
                >
                  <CartesianGrid stroke="var(--border)" horizontal={false} />
                  <XAxis
                    type="number"
                    stroke="var(--muted-foreground)"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="item"
                    stroke="var(--muted-foreground)"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    width={140}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(v: number) =>
                      anyRevenue
                        ? [`${Math.round(v).toLocaleString()} JOD`, "Revenue"]
                        : [`${v.toLocaleString()} units`, "Units"]
                    }
                  />
                  <Bar dataKey={anyRevenue ? "revenue" : "units"} radius={[0, 3, 3, 0]}>
                    {topProducts.map((_, i) => (
                      <Cell key={i} fill={i === 0 ? "var(--careem)" : "rgba(63,209,122,0.7)"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Panel>

        {/* SALES BY ITEM */}
        <SectionLabel>Sales by Item</SectionLabel>
        <Panel
          title="Per-item breakdown"
          sub="Units, revenue (JOD), COGS (units × cost version active that month), and product margin. Tap a column to sort."
          asOf={freshness.items}
        >
          {items.length === 0 ? (
            <Empty text="No item-level data for this range." />
          ) : (
            <div className="overflow-auto -mx-2 max-h-[520px]">
              <table className="w-full text-[12px]">
                <thead className="bg-background/40 text-muted-foreground sticky top-0">
                  <tr>
                    <ThSort
                      label="Item"
                      col="item"
                      sortBy={sortBy}
                      sortDir={sortDir}
                      onSort={(c) => toggleSort(c, sortBy, sortDir, setSortBy, setSortDir)}
                      align="left"
                    />
                    <ThSort
                      label="Units"
                      col="units"
                      sortBy={sortBy}
                      sortDir={sortDir}
                      onSort={(c) => toggleSort(c, sortBy, sortDir, setSortBy, setSortDir)}
                    />
                    <ThSort
                      label="Revenue (JOD)"
                      col="revenue"
                      sortBy={sortBy}
                      sortDir={sortDir}
                      onSort={(c) => toggleSort(c, sortBy, sortDir, setSortBy, setSortDir)}
                    />
                    <ThSort
                      label="Cost / unit (exVAT)"
                      col="cost"
                      sortBy={sortBy}
                      sortDir={sortDir}
                      onSort={(c) => toggleSort(c, sortBy, sortDir, setSortBy, setSortDir)}
                    />
                    <ThSort
                      label="COGS (JOD)"
                      col="cogs"
                      sortBy={sortBy}
                      sortDir={sortDir}
                      onSort={(c) => toggleSort(c, sortBy, sortDir, setSortBy, setSortDir)}
                    />
                    <ThSort
                      label="Margin %"
                      col="margin"
                      sortBy={sortBy}
                      sortDir={sortDir}
                      onSort={(c) => toggleSort(c, sortBy, sortDir, setSortBy, setSortDir)}
                    />
                  </tr>
                </thead>
                <tbody>
                  {items.map((r) => (
                    <tr key={r.item} className="border-t border-border">
                      <td className="px-3 py-2">{r.item}</td>
                      <td className="px-3 py-2 text-right text-num">{r.units.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right text-num font-semibold">
                        {r.revenue > 0 ? Math.round(r.revenue).toLocaleString() : "—"}
                      </td>
                      <td className="px-3 py-2 text-right text-num text-muted-foreground">
                        {r.lastCost != null ? r.lastCost.toFixed(2) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right text-num">
                        {r.cogs > 0 ? Math.round(r.cogs).toLocaleString() : "—"}
                      </td>
                      <td
                        className="px-3 py-2 text-right text-num"
                        style={{
                          color:
                            r.revenue > 0 && r.cogs > 0
                              ? r.margin >= 45
                                ? "var(--careem)"
                                : "#f5b400"
                              : "var(--muted-foreground)",
                        }}
                      >
                        {r.revenue > 0 && r.cogs > 0 ? `${r.margin.toFixed(1)}%` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <div className="mt-8 pt-4 border-t border-border text-[10px] text-muted-foreground text-center">
          The Green Room × Talabat &amp; Careem · Insights tab ·{" "}
          <Link to="/auth" className="underline hover:text-foreground">
            Admin sign in
          </Link>
        </div>
      </div>
    </div>
  );
}

function toggleSort(
  col: SortKey,
  sortBy: SortKey,
  sortDir: "asc" | "desc",
  setSortBy: (c: SortKey) => void,
  setSortDir: (d: "asc" | "desc") => void,
) {
  if (col === sortBy) setSortDir(sortDir === "asc" ? "desc" : "asc");
  else {
    setSortBy(col);
    setSortDir(col === "item" ? "asc" : "desc");
  }
}

function ThSort({
  label,
  col,
  sortBy,
  sortDir,
  onSort,
  align = "right",
}: {
  label: string;
  col: SortKey;
  sortBy: SortKey;
  sortDir: "asc" | "desc";
  onSort: (c: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = col === sortBy;
  return (
    <th
      className={`px-3 py-2 font-semibold text-[11px] uppercase tracking-wide whitespace-nowrap text-${align}`}
    >
      <button
        onClick={() => onSort(col)}
        className="inline-flex items-center gap-1 hover:text-foreground"
      >
        {label}
        <span className="text-[9px]" style={{ color: active ? "var(--primary)" : "transparent" }}>
          {sortDir === "asc" ? "▲" : "▼"}
        </span>
      </button>
    </th>
  );
}

function Panel({
  title,
  sub,
  asOf,
  children,
}: {
  title: string;
  sub?: string;
  asOf: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4 mb-2">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="font-display text-[15px] font-semibold">{title}</h3>
          {sub && <div className="text-[10.5px] text-muted-foreground mt-0.5">{sub}</div>}
        </div>
        <span className="text-[10px] text-muted-foreground whitespace-nowrap">
          Data as of {asOf ?? "—"}
        </span>
      </div>
      {children}
    </div>
  );
}

function TierCard({
  title,
  sub,
  asOf,
  children,
  bg,
}: {
  title: string;
  sub?: string;
  asOf: string | null;
  children: React.ReactNode;
  bg?: string;
}) {
  return (
    <div
      className="rounded-2xl border border-white/10 p-4"
      style={{ background: bg ?? "linear-gradient(135deg, #0b2222, #0f2c2c)" }}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="font-display text-[15px] font-semibold text-white">{title}</h3>
          {sub && <div className="text-[10.5px] text-white/60 mt-0.5">{sub}</div>}
        </div>
        <span className="text-[10px] text-white/50 whitespace-nowrap">
          Data as of {asOf ?? "—"}
        </span>
      </div>
      {children}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="text-[11.5px] text-muted-foreground py-8 px-4 text-center border border-dashed border-border rounded-xl">
      {text}
    </div>
  );
}

type Tiers = {
  totalSales: number;
  totalOrders: number;
  subSales: number;
  subOrders: number;
  nonSales: number;
  nonOrders: number;
  subAov: number;
  regAov: number;
  overallAov: number;
  hasSub: boolean;
};

type DailyRow = {
  platform: string;
  date: string;
  sales: number;
  orders: number;
  cplusSales?: number;
  cplusOrders?: number;
  proSales?: number;
  proOrders?: number;
};

/** Build subscriber-vs-regular tier figures for one platform over the selected months. */
function buildTiers(
  daily: DailyRow[] | undefined,
  platform: string,
  rangeMonths: string[],
  getSubSales: (r: DailyRow) => number,
  getSubOrders: (r: DailyRow) => number,
): Tiers | null {
  if (!daily) return null;
  const rows = daily.filter(
    (d) => d.platform === platform && rangeMonths.includes(monthOfDate(d.date)),
  );
  if (!rows.length) return null;
  const totalSales = rows.reduce((s, r) => s + r.sales, 0);
  const totalOrders = rows.reduce((s, r) => s + r.orders, 0);
  const subSales = rows.reduce((s, r) => s + getSubSales(r), 0);
  const subOrders = rows.reduce((s, r) => s + getSubOrders(r), 0);
  // Clamp regular figures — Plus data can cover a different date window than overall,
  // making subSales > totalSales and producing negative regular AOV / >100% share.
  const regSales = Math.max(0, totalSales - subSales);
  const regOrders = Math.max(0, totalOrders - subOrders);
  return {
    totalSales,
    totalOrders,
    subSales,
    subOrders,
    nonSales: regSales,
    nonOrders: regOrders,
    subAov: subOrders > 0 ? subSales / subOrders : 0,
    regAov: regOrders > 0 ? regSales / regOrders : 0,
    overallAov: totalOrders > 0 ? totalSales / totalOrders : 0,
    hasSub: subSales > 0 || subOrders > 0,
  };
}

function TierBody({
  t, subLabel, colorVar, barColor,
}: {
  t: Tiers; subLabel: string; colorVar: string; barColor: string;
}) {
  const sharePctSales = t.totalSales > 0 ? (t.subSales / t.totalSales) * 100 : 0;
  const sharePctOrders = t.totalOrders > 0 ? (t.subOrders / t.totalOrders) * 100 : 0;
  return (
    <div className="space-y-3">
      <ShareRow
        label="Sales share"
        sub={t.subSales}
        other={t.nonSales}
        pct={sharePctSales}
        unit="JOD"
        barColor={barColor}
      />
      <ShareRow
        label="Orders share"
        sub={t.subOrders}
        other={t.nonOrders}
        pct={sharePctOrders}
        unit="orders"
        barColor={barColor}
      />
      <div className="grid grid-cols-3 gap-2 pt-2">
        <MiniStat label={`${subLabel} AOV`} value={t.subAov.toFixed(2)} unit="JOD" accentColor={colorVar} />
        <MiniStat label="Regular AOV" value={t.nonOrders > 0 ? t.regAov.toFixed(2) : "—"} unit={t.nonOrders > 0 ? "JOD" : ""} />
        <MiniStat label="Overall AOV" value={t.overallAov.toFixed(2)} unit="JOD" />
      </div>
    </div>
  );
}

function ShareRow({
  label,
  sub,
  other,
  pct,
  unit,
  barColor,
}: {
  label: string;
  sub: number;
  other: number;
  pct: number;
  unit: string;
  barColor: string;
}) {
  const cap = Math.max(0, Math.min(pct, 100));
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] mb-1">
        <span className="text-white/60">{label}</span>
        <span className="text-num">
          <span className="font-semibold text-white">
            {Math.round(sub).toLocaleString()}
          </span>
          <span className="text-white/50">
            {" "}
            / {Math.round(sub + other).toLocaleString()} {unit}
          </span>
          <span className="ml-2 font-semibold text-white">
            ({Math.min(100, pct).toFixed(1)}%)
          </span>
        </span>
      </div>
      <div
        className="h-2 rounded-md overflow-hidden flex"
        style={{ background: "rgba(255,255,255,0.15)" }}
      >
        <div className="h-full transition-all" style={{ width: `${cap}%`, background: barColor }} />
      </div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  unit,
  accentColor,
}: {
  label: string;
  value: string;
  unit: string;
  accentColor?: string;
}) {
  return (
    <div className="bg-background/40 border border-white/10 rounded-lg p-2.5">
      <div className="text-[9.5px] uppercase tracking-wide text-white/60 font-semibold">
        {label}
      </div>
      <div
        className="font-display text-[18px] font-semibold mt-0.5 text-white"
        style={{ color: accentColor }}
      >
        {value} <span className="text-[10px] text-white/50">{unit}</span>
      </div>
    </div>
  );
}
