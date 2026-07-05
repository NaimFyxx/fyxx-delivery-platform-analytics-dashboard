import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/fyxx/page-header";
import { InfoTip } from "@/components/fyxx/info-tip";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { MonthPicker } from "@/components/fyxx/date-picker";
import { EmptyState } from "@/components/fyxx/empty-state";
import { fmtJOD, fmtInt, platformBg, platformsFromFilter, type Platform, type PlatformKey } from "@/lib/fyxx";
import { type RangeKey } from "@/lib/months";
import { type CostRow } from "@/lib/costs";
import { aggregateItems } from "@/lib/items";
import { loadDbAliases } from "@/lib/aliases";
import { Segmented } from "../dashboard";
import { useRangeFilter } from "@/hooks/use-range-filter";

export const Route = createFileRoute("/_authenticated/items")({
  head: () => ({ meta: [{ title: "Items · TGR" }] }),
  component: Items,
});


function Items() {
  const [platform, setPlatform] = useState<PlatformKey>("All");
  const [q, setQ] = useState("");

  const { data: months = [] } = useQuery({
    queryKey: ["item_sales_months"],
    queryFn: async () => {
      const { data, error } = await supabase.from("monthly_item_sales").select("month");
      if (error) throw error;
      return Array.from(new Set((data ?? []).map((r) => r.month))).sort() as string[];
    },
  });

  const allMonths = months;

  // Derive "today" from the latest data month so "This Month" resolves the same as dashboard/insights.
  const today = useMemo(() => {
    const last = allMonths.at(-1);
    return last ? `${last}-28` : new Date().toISOString().slice(0, 10);
  }, [allMonths]);

  const { range, setRange, customFrom, customTo, handleCustomFrom, handleCustomTo, rangeMonths, rangeLabel } =
    useRangeFilter({ allMonths, today });

  const { data: sales = [] } = useQuery({
    queryKey: ["monthly_item_sales", rangeMonths],
    queryFn: async () => {
      if (!rangeMonths.length) return [];
      const { data, error } = await supabase
        .from("monthly_item_sales")
        .select("*")
        .in("month", rangeMonths);
      if (error) throw error;
      return data ?? [];
    },
    enabled: rangeMonths.length > 0,
  });

  const { data: costs = [] } = useQuery({
    queryKey: ["item_costs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("item_costs").select("*").order("effective_from", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: prices = [] } = useQuery({
    queryKey: ["item_prices"],
    queryFn: async () => {
      const { data, error } = await supabase.from("item_prices").select("*");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: financials = [] } = useQuery({
    queryKey: ["monthly_financials", rangeMonths],
    queryFn: async () => {
      if (!rangeMonths.length) return [];
      const { data, error } = await supabase
        .from("monthly_financials")
        .select("month,platform,gross_sales,actual_payout,discount")
        .in("month", rangeMonths);
      if (error) throw error;
      return (data ?? []).map((r) => ({
        month: r.month,
        platform: r.platform as string,
        gross: Number(r.gross_sales),
        payout: Number(r.actual_payout),
        discount: Number(r.discount ?? 0),
      }));
    },
    enabled: rangeMonths.length > 0,
  });

  const { data: dbAliases = {} } = useQuery({
    queryKey: ["item_aliases"],
    queryFn: loadDbAliases,
    staleTime: 60_000,
  });

  const costRows: CostRow[] = useMemo(
    () => costs.map((c) => ({ item: c.item_name, cost: Number(c.cost_exvat), effective_from: c.effective_from })),
    [costs],
  );

  const activePlatforms: string[] = platformsFromFilter(platform);

  const aggregated = useMemo(() => {
    const mapped = sales.map((s) => ({
      month: s.month,
      platform: s.platform,
      item: s.item_name,
      units: s.units,
      revenue: Number((s as any).revenue_jod ?? 0),
    }));
    return aggregateItems({
      itemSales: mapped,
      costs: costRows,
      prices,
      financials,
      rangeMonths,
      platforms: activePlatforms,
      dbAliases,
    })
      .filter((r) => !q || r.item.toLowerCase().includes(q.toLowerCase()))
      .sort((a, b) => b.units - a.units);
  }, [sales, costRows, prices, financials, rangeMonths, activePlatforms, dbAliases, q]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader title="Items" description="Sell-price columns show your set list price (bold); 'avg' is what customers actually paid — revenue ÷ units, after discounts & combos." />

      <div className="flex flex-wrap gap-3 mb-4 items-center">
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
        <Input placeholder="Search items…" value={q} onChange={(e) => setQ(e.target.value)} className="w-64" />
      </div>

      {range !== "this" && range !== "last" && (
        <p className="text-xs text-muted-foreground mb-3">{rangeLabel}</p>
      )}

      {sales.length === 0 ? (
        <EmptyState label={rangeLabel} />
      ) : (
      <Card className="p-0 overflow-hidden overflow-x-auto">
        <Table className="min-w-[700px]">
          <TableHeader>
            <TableRow className="align-bottom">
              <TableHead className="align-bottom h-auto py-2.5 leading-tight">Item</TableHead>
              <TableHead className="align-bottom h-auto py-2.5 leading-tight">Platforms</TableHead>
              <TableHead className="text-right align-bottom h-auto py-2.5 leading-tight whitespace-normal">Units<InfoTip id="units" side="bottom" /></TableHead>
              <TableHead className="text-right align-bottom h-auto py-2.5 leading-tight whitespace-normal">Talabat — sell price<InfoTip id="sell_price" side="bottom" /></TableHead>
              <TableHead className="text-right align-bottom h-auto py-2.5 leading-tight whitespace-normal">Careem — sell price<InfoTip id="sell_price" side="bottom" /></TableHead>
              <TableHead className="text-right align-bottom h-auto py-2.5 leading-tight whitespace-normal">Unit cost (ex-VAT)<InfoTip id="unit_cost" side="bottom" /></TableHead>
              <TableHead className="text-right align-bottom h-auto py-2.5 leading-tight whitespace-normal">Total COGS<InfoTip id="total_cogs" side="bottom" /></TableHead>
              <TableHead className="text-right align-bottom h-auto py-2.5 leading-tight whitespace-normal">Margin after commission %<InfoTip id="margin_after_commission" side="bottom" /></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {aggregated.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-12">
                  No item sales for {rangeLabel}.
                </TableCell>
              </TableRow>
            )}
            {aggregated.map((r) => (
              <TableRow key={r.item}>
                <TableCell className="font-medium">{r.item}</TableCell>
                <TableCell className="space-x-1">
                  {Array.from(r.platforms).map((p) => (
                    <Badge key={p} variant="outline" className={platformBg(p as Platform)}>{p}</Badge>
                  ))}
                </TableCell>
                <TableCell className="text-right text-num">{fmtInt(r.units)}</TableCell>
                <TableCell className="text-right text-num">
                  <PriceCell
                    listPrice={r.listPrice["Talabat"]}
                    ppUnits={r.perPlatform["Talabat"]?.units ?? 0}
                    ppRevenue={r.perPlatform["Talabat"]?.revenue ?? 0}
                  />
                </TableCell>
                <TableCell className="text-right text-num">
                  <PriceCell
                    listPrice={r.listPrice["Careem"]}
                    ppUnits={r.perPlatform["Careem"]?.units ?? 0}
                    ppRevenue={r.perPlatform["Careem"]?.revenue ?? 0}
                  />
                </TableCell>
                <TableCell className="text-right text-num">
                  {r.lastCost == null
                    ? <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-600 bg-amber-500/10">no cost</Badge>
                    : fmtJOD(r.lastCost)}
                </TableCell>
                <TableCell className="text-right text-num">
                  {r.cogs === 0 && r.lastCost == null
                    ? <span className="text-muted-foreground">—</span>
                    : fmtJOD(r.cogs)}
                </TableCell>
                <TableCell
                  className="text-right text-num font-semibold"
                  style={{
                    color: r.commMargin != null
                      ? r.commMargin >= 0 ? "var(--careem)" : "var(--destructive)"
                      : "var(--muted-foreground)",
                  }}
                >
                  {r.commMargin != null ? `${r.commMargin.toFixed(1)}%` : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      )}
    </div>
  );
}

function PriceCell({ listPrice, ppUnits, ppRevenue }: {
  listPrice: number | null | undefined;
  ppUnits: number;
  ppRevenue: number;
}) {
  const realized = ppUnits > 0 ? ppRevenue / ppUnits : null;

  if (listPrice == null && realized == null) {
    return <span className="text-muted-foreground">—</span>;
  }

  if (listPrice == null) {
    // No list price entered — label the realized avg so it's not mistaken for a set price
    return <div className="text-[11px] text-muted-foreground">avg {fmtJOD(realized!)}</div>;
  }

  // List price is set — bold headline, realized avg beneath
  return (
    <div>
      <div className="font-semibold">{fmtJOD(listPrice)}</div>
      {realized != null && (
        <div className="text-[10px] text-muted-foreground">avg {fmtJOD(realized)}</div>
      )}
    </div>
  );
}
