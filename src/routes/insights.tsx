import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AdminShell } from "@/components/fyxx/admin-sidebar";
import { InfoTip } from "@/components/fyxx/info-tip";
import { useSoftGate } from "@/hooks/use-soft-gate";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getDashboardData } from "@/lib/dashboard.functions";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Cell,
} from "recharts";
import { MonthPicker } from "@/components/fyxx/date-picker";
import { EmptyState } from "@/components/fyxx/empty-state";
import { Header, Segmented, SectionLabel, type PlatformKey } from "./dashboard";
import { monthOfDate, monthLabel, type RangeKey } from "@/lib/months";
import { platformsFromFilter } from "@/lib/fyxx";
import { useRangeFilter } from "@/hooks/use-range-filter";
import { aggregateItems } from "@/lib/items";

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

type SortKey = "item" | "units" | "revenue" | "avgPrice" | "cogs" | "cost" | "margin" | "commMargin" | "netMargin";

function InsightsPage() {
  const { adminUser, sessionChecked, handleSignOut } = useSoftGate();

  const fetchData = useServerFn(getDashboardData);
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => fetchData(),
    refetchOnWindowFocus: false,
  });

  const [platform, setPlatform] = useState<PlatformKey>("All");
  const platforms: string[] = platformsFromFilter(platform);

  const today = useMemo(() => {
    const last = data?.daily.at(-1)?.date;
    return last ?? new Date().toISOString().slice(0, 10);
  }, [data]);

  const allMonths = useMemo(() => {
    if (!data) return [];
    const set = new Set<string>();
    data.daily.forEach((d) => set.add(monthOfDate(d.date)));
    data.financials.forEach((d) => set.add(d.month));
    data.itemSales.forEach((d) => set.add(d.month));
    return Array.from(set).sort();
  }, [data]);

  const { range, setRange, customFrom, customTo, handleCustomFrom, handleCustomTo, rangeMonths, rangeLabel } =
    useRangeFilter({ allMonths, today });

  // Does any data fall within the selected range? Drives the "no data" empty state.
  const rangeHasData = useMemo(() => {
    if (!data || !rangeMonths.length) return false;
    const set = new Set(rangeMonths);
    return (
      data.itemSales.some((i) => set.has(i.month)) ||
      data.customers.some((c) => set.has(c.month)) ||
      data.daily.some((d) => set.has(monthOfDate(d.date)))
    );
  }, [data, rangeMonths]);

  const [sortBy, setSortBy] = useState<SortKey>("revenue");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // --- Per-item aggregation across selected months + platforms ---
  const items = useMemo(() => {
    if (!data) return [];
    const agg = aggregateItems({
      itemSales: data.itemSales,
      costs: data.costs,
      prices: [],
      financials: data.financials,
      rangeMonths,
      platforms,
    }).map((r) => ({ ...r, margin: r.productMargin ?? 0 }));
    agg.sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      if (sortBy === "item") return a.item.localeCompare(b.item) * dir;
      if (sortBy === "units") return (a.units - b.units) * dir;
      if (sortBy === "revenue") return (a.revenue - b.revenue) * dir;
      if (sortBy === "avgPrice") return ((a.avgPrice ?? 0) - (b.avgPrice ?? 0)) * dir;
      if (sortBy === "cogs") return (a.cogs - b.cogs) * dir;
      if (sortBy === "margin") return (a.margin - b.margin) * dir;
      if (sortBy === "commMargin") return ((a.commMargin ?? -Infinity) - (b.commMargin ?? -Infinity)) * dir;
      if (sortBy === "netMargin") return ((a.netMargin ?? -Infinity) - (b.netMargin ?? -Infinity)) * dir;
      return ((a.lastCost ?? 0) - (b.lastCost ?? 0)) * dir;
    });
    return agg;
  }, [data, rangeMonths, platforms, sortBy, sortDir]);

  const anyRevenue = useMemo(() => items.some((r) => r.revenue > 0), [items]);
  const topProducts = useMemo(
    () =>
      [...items]
        .sort((a, b) => (anyRevenue ? b.revenue - a.revenue : b.units - a.units))
        .slice(0, 10),
    [items, anyRevenue],
  );

  // --- Tiers: Careem uses Plus customer counts (only Plus data Careem exports);
  //     Talabat uses Pro sales/orders (which Talabat does export). ---
  const careemMix = useMemo(
    () => buildCustomerMix(data?.daily, "Careem", rangeMonths),
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

  // --- New vs Returning customer data ---
  const customerRows = useMemo(() => {
    if (!data) return [];
    return data.customers.filter((r) => {
      if (!rangeMonths.includes(r.month)) return false;
      if (platform !== "All" && r.platform !== platform) return false;
      return true;
    });
  }, [data, rangeMonths, platform]);

  // Per-platform chart series (all months in range).
  const makeCustomerSeries = (p: string) => {
    if (!data) return [];
    const pRows = data.customers.filter((r) => r.platform === p && rangeMonths.includes(r.month));
    return pRows
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((r) => ({
        label: monthLabel(r.month),
        new: r.new,
        returning: r.returning,
        reactivated: r.reactivated,
        retained: Math.max(0, r.returning - r.reactivated),
        repeatRate: r.overall > 0 ? (r.returning / r.overall) * 100 : null,
        basis: r.basis,
      }));
  };

  // Aggregate KPI tiles for the selected period + platform filter.
  const customerKpi = useMemo(() => {
    if (!customerRows.length) return null;
    const totalNew = customerRows.reduce((s, r) => s + r.new, 0);
    const totalReturning = customerRows.reduce((s, r) => s + r.returning, 0);
    const totalOverall = customerRows.reduce((s, r) => s + r.overall, 0);
    const daysInRange = rangeMonths.reduce((s, m) => {
      const [y, mo] = m.split("-").map(Number);
      return s + new Date(y, mo, 0).getDate();
    }, 0);
    return {
      pctNew: totalOverall > 0 ? (totalNew / totalOverall) * 100 : null,
      pctReturning: totalOverall > 0 ? (totalReturning / totalOverall) * 100 : null,
      totalNew,
      totalReturning,
      avgNewPerDay: daysInRange > 0 ? totalNew / daysInRange : null,
      avgReturningPerDay: daysInRange > 0 ? totalReturning / daysInRange : null,
      hasMultipleBases: platform === "All" && new Set(customerRows.map((r) => r.basis)).size > 1,
    };
  }, [customerRows, platform, rangeMonths]);

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
      "careem:plus_customers",
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

  if (!sessionChecked || isLoading || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Loading insights…
      </div>
    );
  }

  // Use monthly_financials for sales — same source as the dashboard pill.
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
              <div className="w-36">
                <MonthPicker value={customFrom} onChange={handleCustomFrom} />
              </div>
              <label className="text-muted-foreground">To</label>
              <div className="w-36">
                <MonthPicker value={customTo} onChange={handleCustomTo} min={customFrom} />
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

        {!rangeHasData ? (
          <EmptyState label={rangeLabel} />
        ) : (
        <>
        {/* CUSTOMER TIERS — prominent */}
        <SectionLabel>Customer Tiers — Careem+ &amp; Talabat Pro</SectionLabel>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 mb-2">
          <TierCard
            title="Careem+ vs Regular"
            sub="Plus vs regular customer mix (daily counts)"
            asOf={freshness.daily}
            bg="linear-gradient(135deg, #0a3d2b, #0f5c3e)"
          >
            {!careemMix || !careemMix.has ? (
              <Empty text="Import the Careem Plus — Customers file (Customer Insights → Careem Plus, non Careem Plus)." />
            ) : (
              <CustomerMixBody mix={careemMix} colorVar="var(--careem)" barColor="#5fd0a3" />
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

        {/* NEW VS RETURNING */}
        <SectionLabel>New vs Returning</SectionLabel>
        {customerKpi && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
            <div className="bg-card border border-border rounded-2xl p-4">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1 flex items-center">% Returning (repeat rate)<InfoTip id="repeat_rate" side="bottom" /></div>
              <div className="font-display text-3xl font-semibold">
                {customerKpi.pctReturning != null ? `${customerKpi.pctReturning.toFixed(1)}%` : "—"}
              </div>
              <div className="text-[10.5px] text-muted-foreground mt-1">
                {Math.round(customerKpi.totalReturning).toLocaleString()} returning /{" "}
                {Math.round(customerKpi.totalReturning + customerKpi.totalNew).toLocaleString()} total
                {customerKpi.hasMultipleBases && (
                  <span className="block mt-0.5 text-amber-600 dark:text-amber-400">
                    Careem = customers · Talabat = orders — KPI shown for informational comparison only.
                  </span>
                )}
              </div>
              {customerKpi.avgReturningPerDay != null && (
                <div className="text-[9.5px] text-muted-foreground mt-0.5">avg {customerKpi.avgReturningPerDay.toFixed(1)}/day</div>
              )}
            </div>
            <div className="bg-card border border-border rounded-2xl p-4">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold mb-1 flex items-center">% New<InfoTip id="new_customers" side="bottom" /></div>
              <div className="font-display text-3xl font-semibold">
                {customerKpi.pctNew != null ? `${customerKpi.pctNew.toFixed(1)}%` : "—"}
              </div>
              <div className="text-[10.5px] text-muted-foreground mt-1">
                {Math.round(customerKpi.totalNew).toLocaleString()} new /{" "}
                {Math.round(customerKpi.totalReturning + customerKpi.totalNew).toLocaleString()} total
              </div>
              {customerKpi.avgNewPerDay != null && (
                <div className="text-[9.5px] text-muted-foreground mt-0.5">avg {customerKpi.avgNewPerDay.toFixed(1)}/day</div>
              )}
            </div>
          </div>
        )}
        {platform === "All" ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5 mb-2">
            <CustomerPanel platform="Careem" series={makeCustomerSeries("Careem")} freshness={freshness.daily} />
            <CustomerPanel platform="Talabat" series={makeCustomerSeries("Talabat")} freshness={freshness.daily} />
          </div>
        ) : (
          <div className="mb-2">
            <CustomerPanel platform={platform} series={makeCustomerSeries(platform)} freshness={freshness.daily} />
          </div>
        )}
        {!customerKpi && !data.customers.length && (
          <div className="bg-card border border-border rounded-2xl p-4 mb-2">
            <Empty text="No customer data imported yet. Import the Careem 'New, Retained & Reactivated Customers' report and the Talabat 'Sales, Customers & Operations' report." />
          </div>
        )}
        {!customerKpi && !!data.customers.length && (
          <div className="bg-card border border-border rounded-2xl p-4 mb-2">
            <Empty text="No customer data for this range / platform. Try All-Time or change the platform filter." />
          </div>
        )}

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
          sub="Units, revenue, avg price, COGS, product margin (menu price), and Zeid's net margin (allocated payout). Tap a column to sort."
          asOf={freshness.items}
        >
          {items.length === 0 ? (
            <Empty text="No item-level data for this range." />
          ) : (
            <div className="overflow-auto overscroll-contain max-h-[520px]">
              <table className="min-w-[700px] w-full text-[12px]">
                <thead className="bg-background text-muted-foreground sticky top-0">
                  <tr>
                    <ThSort label="Item" col="item" sortBy={sortBy} sortDir={sortDir} onSort={(c) => toggleSort(c, sortBy, sortDir, setSortBy, setSortDir)} align="left" className="sticky left-0 z-20 bg-background border-r border-border" />
                    <ThSort label="Units" col="units" sortBy={sortBy} sortDir={sortDir} onSort={(c) => toggleSort(c, sortBy, sortDir, setSortBy, setSortDir)} infoId="units" />
                    <ThSort label="Revenue (JOD)" col="revenue" sortBy={sortBy} sortDir={sortDir} onSort={(c) => toggleSort(c, sortBy, sortDir, setSortBy, setSortDir)} infoId="revenue" />
                    <ThSort label="Avg price/unit" col="avgPrice" sortBy={sortBy} sortDir={sortDir} onSort={(c) => toggleSort(c, sortBy, sortDir, setSortBy, setSortDir)} infoId="avg_price_unit" />
                    <ThSort label="Cost/unit (exVAT)" col="cost" sortBy={sortBy} sortDir={sortDir} onSort={(c) => toggleSort(c, sortBy, sortDir, setSortBy, setSortDir)} infoId="unit_cost" />
                    <ThSort label="COGS (JOD)" col="cogs" sortBy={sortBy} sortDir={sortDir} onSort={(c) => toggleSort(c, sortBy, sortDir, setSortBy, setSortDir)} infoId="total_cogs" />
                    <ThSort label="Product margin %" col="margin" sortBy={sortBy} sortDir={sortDir} onSort={(c) => toggleSort(c, sortBy, sortDir, setSortBy, setSortDir)} infoId="product_margin" />
                    <th className="px-3 py-2 font-semibold text-[11px] uppercase tracking-wide whitespace-nowrap text-right">
                      <span className="inline-flex items-center gap-1">
                        <button
                          onClick={() => toggleSort("commMargin", sortBy, sortDir, setSortBy, setSortDir)}
                          className="inline-flex items-center gap-1 hover:text-foreground"
                        >
                          Margin after commission %
                          <span className="text-[9px]" style={{ color: sortBy === "commMargin" ? "var(--primary)" : "transparent" }}>
                            {sortDir === "asc" ? "▲" : "▼"}
                          </span>
                        </button>
                        <InfoTip id="margin_after_commission" side="bottom" />
                      </span>
                    </th>
                    <th className="px-3 py-2 font-semibold text-[11px] uppercase tracking-wide whitespace-nowrap text-right">
                      <span className="inline-flex items-center gap-1">
                        <button
                          onClick={() => toggleSort("netMargin", sortBy, sortDir, setSortBy, setSortDir)}
                          className="inline-flex items-center gap-1 hover:text-foreground"
                        >
                          Net margin %
                          <span className="text-[9px]" style={{ color: sortBy === "netMargin" ? "var(--primary)" : "transparent" }}>
                            {sortDir === "asc" ? "▲" : "▼"}
                          </span>
                        </button>
                        <InfoTip id="net_margin" side="bottom" />
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((r) => (
                    <tr key={r.item} className="border-t border-border">
                      <td className="px-3 py-2 sticky left-0 z-10 bg-card border-r border-border">{r.item}</td>
                      <td className="px-3 py-2 text-right text-num">{r.units.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right text-num font-semibold">
                        {r.revenue > 0 ? Math.round(r.revenue).toLocaleString() : "—"}
                      </td>
                      <td className="px-3 py-2 text-right text-num text-muted-foreground">
                        {r.avgPrice != null ? r.avgPrice.toFixed(2) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right text-num text-muted-foreground">
                        {r.lastCost != null ? r.lastCost.toFixed(2) : "—"}
                      </td>
                      <td className="px-3 py-2 text-right text-num">
                        {r.cogs > 0 ? Math.round(r.cogs).toLocaleString() : "—"}
                      </td>
                      <td className="px-3 py-2 text-right text-num" style={{ color: r.revenue > 0 && r.cogs > 0 ? r.margin >= 45 ? "var(--careem)" : "#f5b400" : "var(--muted-foreground)" }}>
                        {r.revenue > 0 && r.cogs > 0 ? `${r.margin.toFixed(1)}%` : "—"}
                      </td>
                      <td className="px-3 py-2 text-right text-num font-semibold" style={{ color: r.commMargin != null ? r.commMargin >= 30 ? "var(--careem)" : r.commMargin >= 0 ? "#f5b400" : "var(--destructive)" : "var(--muted-foreground)" }}>
                        {r.commMargin != null ? `${r.commMargin.toFixed(1)}%` : "—"}
                      </td>
                      <td className="px-3 py-2 text-right text-num font-semibold" style={{ color: r.netMargin != null ? r.netMargin >= 30 ? "var(--careem)" : r.netMargin >= 0 ? "#f5b400" : "var(--destructive)" : "var(--muted-foreground)" }}>
                        {r.netMargin != null ? `${r.netMargin.toFixed(1)}%` : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
        </>
        )}

        <div className="mt-8 pt-4 border-t border-border text-[10px] text-muted-foreground text-center">
          The Green Room × Talabat &amp; Careem · Insights tab ·{" "}
          <Link to="/auth" className="underline hover:text-foreground">
            Admin sign in
          </Link>
        </div>
      </div>
    </div>
    </AdminShell>
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
  className = "",
  infoId,
}: {
  label: string;
  col: SortKey;
  sortBy: SortKey;
  sortDir: "asc" | "desc";
  onSort: (c: SortKey) => void;
  align?: "left" | "right";
  className?: string;
  infoId?: string;
}) {
  const active = col === sortBy;
  return (
    <th
      className={`px-3 py-2 font-semibold text-[11px] uppercase tracking-wide whitespace-nowrap text-${align} ${className}`}
    >
      <span className="inline-flex items-center gap-1">
        <button
          onClick={() => onSort(col)}
          className="inline-flex items-center gap-1 hover:text-foreground"
        >
          {label}
          <span className="text-[9px]" style={{ color: active ? "var(--primary)" : "transparent" }}>
            {sortDir === "asc" ? "▲" : "▼"}
          </span>
        </button>
        {infoId && <InfoTip id={infoId} side="bottom" />}
      </span>
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
  cplusCustomers?: number;
  nonCplusCustomers?: number;
  proSales?: number;
  proOrders?: number;
};

type CustomerMix = {
  plus: number;
  regular: number;
  total: number;
  plusPct: number;
  regularPct: number;
  has: boolean;
};

/** Careem Plus vs non-Plus customer counts summed over the selected months. */
function buildCustomerMix(
  daily: DailyRow[] | undefined,
  platform: string,
  rangeMonths: string[],
): CustomerMix | null {
  if (!daily) return null;
  const rows = daily.filter(
    (d) => d.platform === platform && rangeMonths.includes(monthOfDate(d.date)),
  );
  if (!rows.length) return null;
  const plus = rows.reduce((s, r) => s + (r.cplusCustomers ?? 0), 0);
  const regular = rows.reduce((s, r) => s + (r.nonCplusCustomers ?? 0), 0);
  const total = plus + regular;
  return {
    plus,
    regular,
    total,
    plusPct: total > 0 ? (plus / total) * 100 : 0,
    regularPct: total > 0 ? (regular / total) * 100 : 0,
    has: total > 0,
  };
}

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

/** Careem Plus vs regular customer mix — counts + % share (Careem exports no Plus sales/orders). */
function CustomerMixBody({
  mix, colorVar, barColor,
}: {
  mix: CustomerMix; colorVar: string; barColor: string;
}) {
  return (
    <div className="space-y-3">
      <ShareRow
        label="Plus customers"
        sub={mix.plus}
        other={mix.regular}
        pct={mix.plusPct}
        unit="customers"
        barColor={barColor}
      />
      <div className="grid grid-cols-2 gap-2 pt-2">
        <MiniStat
          label="Plus customers"
          value={Math.round(mix.plus).toLocaleString()}
          unit={`${mix.plusPct.toFixed(1)}%`}
          accentColor={colorVar}
        />
        <MiniStat
          label="Regular customers"
          value={Math.round(mix.regular).toLocaleString()}
          unit={`${mix.regularPct.toFixed(1)}%`}
        />
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

type CustomerSeriesRow = {
  label: string;
  new: number;
  returning: number;
  reactivated: number;
  retained: number;
  repeatRate: number | null;
  basis: string;
};

function CustomerPanel({
  platform,
  series,
  freshness,
}: {
  platform: string;
  series: CustomerSeriesRow[];
  freshness: string | null;
}) {
  if (!series.length) {
    return (
      <div className="bg-card border border-border rounded-2xl p-4">
        <div className="font-display text-[15px] font-semibold mb-1">{platform}</div>
        <Empty text={`No ${platform} customer data in this range.`} />
      </div>
    );
  }

  const basis = series[0].basis; // "customers" | "orders"
  const isCareem = platform === "Careem";
  // For Careem, split Returning into Retained + Reactivated when reactivated > 0
  const showSplit = isCareem && series.some((r) => r.reactivated > 0);
  const yLabel = basis === "customers" ? "Customers" : "Orders";

  return (
    <div className="bg-card border border-border rounded-2xl p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <h3 className="font-display text-[15px] font-semibold">{platform}</h3>
          <div className="text-[10.5px] text-muted-foreground mt-0.5">
            Basis: <span className="font-medium">{yLabel}</span> · New vs Returning per month
          </div>
        </div>
        <span className="text-[10px] text-muted-foreground whitespace-nowrap">
          Data as of {freshness ?? "—"}
        </span>
      </div>

      <div className="h-[220px]">
        <ResponsiveContainer>
          <ComposedChart data={series} margin={{ top: 4, right: 40, left: 0, bottom: 4 }}>
            <CartesianGrid stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="label"
              stroke="var(--muted-foreground)"
              fontSize={10}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              yAxisId="left"
              stroke="var(--muted-foreground)"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              width={40}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              stroke="var(--muted-foreground)"
              fontSize={10}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => `${v}%`}
              domain={[0, 100]}
              allowDataOverflow
              width={36}
            />
            <Tooltip
              contentStyle={{
                background: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(v: number, name: string) => {
                if (name === "Repeat rate %") return [`${Number(v).toFixed(1)}%`, name];
                return [Math.round(v).toLocaleString(), name];
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: 10, paddingTop: 4 }}
              iconSize={8}
            />
            <Bar yAxisId="left" dataKey="new" name="New" stackId="a" fill="#C8B89B" radius={[0, 0, 0, 0]} />
            {showSplit ? (
              <>
                <Bar yAxisId="left" dataKey="reactivated" name="Reactivated" stackId="a" fill="rgba(46,110,102,0.45)" />
                <Bar yAxisId="left" dataKey="retained" name="Retained" stackId="a" fill="#2E6E66" radius={[3, 3, 0, 0]} />
              </>
            ) : (
              <Bar yAxisId="left" dataKey="returning" name="Returning" stackId="a" fill="#2E6E66" radius={[3, 3, 0, 0]} />
            )}
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="repeatRate"
              name="Repeat rate %"
              stroke="#f5b400"
              strokeWidth={2}
              dot={{ fill: "#f5b400", r: 3 }}
              connectNulls={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
