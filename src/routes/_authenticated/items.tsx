import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/fyxx/page-header";
import { InfoTip } from "@/components/fyxx/info-tip";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Merge, LineChart as LineChartIcon } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip as RTooltip, CartesianGrid, ResponsiveContainer } from "recharts";
import { MonthPicker } from "@/components/fyxx/date-picker";
import { EmptyState } from "@/components/fyxx/empty-state";
import { fmtJOD, fmtInt, platformBg, platformsFromFilter, type Platform, type PlatformKey } from "@/lib/fyxx";
import { monthLabel, type RangeKey } from "@/lib/months";
import { canonicalItemName, normalizeItemName, type CostRow, type DbAliasMap } from "@/lib/costs";
import { aggregateItems } from "@/lib/items";
import { loadDbAliases } from "@/lib/aliases";
import { loadItemCategories, categoryFor, ALL_CATEGORY_OPTIONS, UNCATEGORISED } from "@/lib/categories";
import { AddProductDialog } from "@/components/fyxx/add-product-dialog";
import { Segmented } from "../dashboard";
import { useRangeFilter } from "@/hooks/use-range-filter";

export const Route = createFileRoute("/_authenticated/items")({
  head: () => ({ meta: [{ title: "Items · TGR" }] }),
  component: Items,
});

/** JOD to 3 decimals (fils) — avg selling price lines up with the platform menu price (19.800). */
const fmtJOD3 = (n: number) =>
  new Intl.NumberFormat("en-JO", {
    style: "currency",
    currency: "JOD",
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  }).format(n);

function Items() {
  const [platform, setPlatform] = useState<PlatformKey>("All");
  const [q, setQ] = useState("");
  // Category filter — "All" shows every category; stacks with the range + platform filters.
  const [categoryFilter, setCategoryFilter] = useState<string>("All");
  const qc = useQueryClient();
  // Item whose monthly price history is open (canonical display name), plus its canonical key.
  const [historyItem, setHistoryItem] = useState<{ label: string; key: string } | null>(null);

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

  const { data: catMap = {} } = useQuery({
    queryKey: ["item_categories"],
    queryFn: loadItemCategories,
    staleTime: 60_000,
  });

  // Assign / clear an item's category. Uncategorised removes the row (no row = Uncategorised),
  // so the mapping table only ever holds real assignments. Keyed by canonical item name so it
  // survives re-imports and is shared by any merged variants.
  const assignCategory = useMutation({
    mutationFn: async ({ key, category }: { key: string; category: string }) => {
      if (category === UNCATEGORISED) {
        const { error } = await supabase.from("item_categories").delete().eq("item_key", key);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("item_categories")
          .upsert({ item_key: key, category }, { onConflict: "item_key" });
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["item_categories"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  // All-time monthly item sales — powers the per-item price history (independent of the range filter).
  const { data: allSales = [] } = useQuery({
    queryKey: ["monthly_item_sales_all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("monthly_item_sales")
        .select("month,platform,item_name,units,revenue_jod");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });

  // Every exact stored item name (all months + cost rows) — the merge picker writes these verbatim.
  const { data: allItemNames = [] } = useQuery({
    queryKey: ["all_item_names"],
    queryFn: async () => {
      const [s, c] = await Promise.all([
        supabase.from("monthly_item_sales").select("item_name"),
        supabase.from("item_costs").select("item_name"),
      ]);
      if (s.error) throw s.error;
      if (c.error) throw c.error;
      const set = new Set<string>();
      (s.data ?? []).forEach((r) => set.add(r.item_name));
      (c.data ?? []).forEach((r) => set.add(r.item_name));
      return Array.from(set).sort((a, b) => a.localeCompare(b));
    },
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
      .map((r) => ({ ...r, category: categoryFor(r.item, catMap, dbAliases) }))
      .filter((r) => !q || r.item.toLowerCase().includes(q.toLowerCase()))
      .filter((r) => categoryFilter === "All" || r.category === categoryFilter)
      .sort((a, b) => b.units - a.units);
  }, [sales, costRows, prices, financials, rangeMonths, activePlatforms, dbAliases, catMap, categoryFilter, q]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader title="Items" description="Sell-price columns show your set list price (bold); 'avg' is what customers actually paid, revenue divided by units, after discounts and combos." />

      <div className="rounded-md border border-border bg-muted/30 px-3 py-2 mb-4 text-[11.5px] leading-relaxed text-muted-foreground max-w-3xl">
        <span className="font-semibold text-foreground">How to read this:</span>{" "}
        Set price (bold) is your menu price. Avg is what customers actually paid per unit, after
        discounts and add-ons. Avg below set price means discounts or vouchers. Avg above set price
        means customers added paid extras. Avg equal to set price means it sold at the menu price.
      </div>

      <div className="flex flex-wrap gap-3 mb-4 items-center">
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
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="h-9 rounded-full border border-border bg-card px-3 text-xs font-medium text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          aria-label="Filter by category"
          title="Filter by category"
        >
          <option value="All">All categories</option>
          {ALL_CATEGORY_OPTIONS.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <Input placeholder="Search items…" value={q} onChange={(e) => setQ(e.target.value)} className="w-64" />
        <div className="ml-auto flex items-center gap-2">
          <AddProductDialog />
          <MergeItemsDialog names={allItemNames} dbAliases={dbAliases} />
        </div>
      </div>

      {range !== "this" && range !== "last" && (
        <p className="text-xs text-muted-foreground mb-3">{rangeLabel}</p>
      )}

      {sales.length === 0 ? (
        <EmptyState label={rangeLabel} />
      ) : (
      <Card className="p-0 overflow-hidden overflow-x-auto">
        <Table className="min-w-[960px]">
          <TableHeader>
            <TableRow className="align-bottom">
              <TableHead className="align-bottom h-auto py-2.5 leading-tight">Item</TableHead>
              <TableHead className="align-bottom h-auto py-2.5 leading-tight">Platforms</TableHead>
              <TableHead className="align-bottom h-auto py-2.5 leading-tight">Category</TableHead>
              <TableHead className="text-right align-bottom h-auto py-2.5 leading-tight whitespace-normal">Units<InfoTip id="units" side="bottom" /></TableHead>
              <TableHead className="text-right align-bottom h-auto py-2.5 leading-tight whitespace-normal">Talabat sell price<InfoTip id="sell_price" side="bottom" /></TableHead>
              <TableHead className="text-right align-bottom h-auto py-2.5 leading-tight whitespace-normal">Careem sell price<InfoTip id="sell_price" side="bottom" /></TableHead>
              <TableHead className="text-right align-bottom h-auto py-2.5 leading-tight whitespace-normal">Avg selling price (incl VAT)<InfoTip id="avg_selling_price" side="bottom" /></TableHead>
              <TableHead className="text-right align-bottom h-auto py-2.5 leading-tight whitespace-normal">Unit cost (ex-VAT)<InfoTip id="unit_cost" side="bottom" /></TableHead>
              <TableHead className="text-right align-bottom h-auto py-2.5 leading-tight whitespace-normal">Total COGS<InfoTip id="total_cogs" side="bottom" /></TableHead>
              <TableHead className="text-right align-bottom h-auto py-2.5 leading-tight whitespace-normal">Margin after commission %<InfoTip id="margin_after_commission" side="bottom" /></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {aggregated.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-sm text-muted-foreground py-12">
                  No item sales for {rangeLabel}.
                </TableCell>
              </TableRow>
            )}
            {aggregated.map((r) => (
              <TableRow key={r.item}>
                <TableCell className="font-medium">
                  <span className="inline-flex items-center gap-1.5">
                    {r.item}
                    <button
                      type="button"
                      onClick={() => setHistoryItem({ label: r.item, key: canonicalItemName(r.item, dbAliases) })}
                      title="Avg selling price history"
                      aria-label={`Price history for ${r.item}`}
                      className="text-muted-foreground/50 hover:text-foreground transition-colors"
                    >
                      <LineChartIcon className="size-3.5" />
                    </button>
                  </span>
                </TableCell>
                <TableCell className="space-x-1">
                  {Array.from(r.platforms).map((p) => (
                    <Badge key={p} variant="outline" className={platformBg(p as Platform)}>{p}</Badge>
                  ))}
                </TableCell>
                <TableCell>
                  <CategoryCell
                    value={r.category}
                    onAssign={(category) =>
                      assignCategory.mutate({ key: canonicalItemName(r.item, dbAliases), category })
                    }
                    pending={assignCategory.isPending}
                  />
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
                  {r.avgPrice != null && r.units > 0
                    ? fmtJOD3(r.avgPrice)
                    : <span className="text-muted-foreground">n/a</span>}
                </TableCell>
                <TableCell className="text-right text-num">
                  {r.lastCost == null
                    ? <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-600 bg-amber-500/10">no cost</Badge>
                    : fmtJOD(r.lastCost)}
                </TableCell>
                <TableCell className="text-right text-num">
                  {r.cogs === 0 && r.lastCost == null
                    ? <span className="text-muted-foreground">n/a</span>
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
                  {r.commMargin != null ? `${r.commMargin.toFixed(1)}%` : "n/a"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      )}

      <PriceHistoryDialog
        item={historyItem}
        allSales={allSales}
        dbAliases={dbAliases}
        onClose={() => setHistoryItem(null)}
      />
    </div>
  );
}

/** Merge a duplicate item name into a canonical one by writing an item_aliases row.
 *  Same alias-write path as the import wizard's "Merge into existing" resolution
 *  (upsert on raw_name), so cross-platform name splits can be fixed without SQL. */
function MergeItemsDialog({ names, dbAliases }: { names: string[]; dbAliases: DbAliasMap }) {
  const [open, setOpen] = useState(false);
  const [dup, setDup] = useState("");
  const [target, setTarget] = useState("");
  const qc = useQueryClient();

  // The target must be a final canonical name — canonicalItemName does a single lookup, so
  // pointing at a name that is itself merged away would break the chain.
  const targetIsAliased = !!target && dbAliases[normalizeItemName(target)] !== undefined;
  const alreadyMerged =
    !!dup && !!target && canonicalItemName(dup, dbAliases) === canonicalItemName(target, dbAliases);
  const sameName = !!dup && dup === target;
  const valid = !!dup && !!target && !sameName && !alreadyMerged && !targetIsAliased;

  function reset() {
    setDup("");
    setTarget("");
  }

  const merge = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("item_aliases").upsert(
        { raw_name: dup, canonical_name: target },
        { onConflict: "raw_name" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`Merged “${dup}” → “${target}”`);
      qc.invalidateQueries({ queryKey: ["item_aliases"] });
      setOpen(false);
      reset();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const selectCls =
    "w-full border border-border rounded-md px-2 py-1.5 bg-background text-xs disabled:opacity-50";

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} disabled={names.length === 0}>
        <Merge className="size-3.5 mr-1.5" /> Merge item
      </Button>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Merge duplicate item</DialogTitle>
            <DialogDescription>
              Point a duplicate name at the item it should count as, so its units, revenue and COGS
              roll up under the canonical name everywhere. This only stores a name alias; no sales data
              is changed, and it can be undone by removing the alias.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-xs font-medium">Duplicate (merged away)</label>
              <select className={selectCls} value={dup} onChange={(e) => setDup(e.target.value)}>
                <option value="">Choose the duplicate</option>
                {names.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium">Into canonical item</label>
              <select className={selectCls} value={target} onChange={(e) => setTarget(e.target.value)}>
                <option value="">Choose the item to keep</option>
                {names.filter((n) => n !== dup).map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>

            {dup && target && (
              <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
                <span className="text-muted-foreground">Result: </span>
                <span className="font-medium">“{dup}”</span>
                <span className="text-muted-foreground"> counts as </span>
                <span className="font-medium">“{target}”</span>
              </div>
            )}
            {alreadyMerged && !sameName && (
              <p className="text-xs text-muted-foreground">
                These already resolve to the same item, so there is nothing to merge.
              </p>
            )}
            {targetIsAliased && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                “{target}” is itself merged into another item. Pick the final canonical name instead.
              </p>
            )}
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={merge.isPending}>
              Cancel
            </Button>
            <Button
              className="bg-gradient-primary text-primary-foreground"
              disabled={!valid || merge.isPending}
              onClick={() => merge.mutate()}
            >
              {merge.isPending && <Loader2 className="size-4 animate-spin mr-2" />}
              Merge
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

type SaleRow = { month: string; platform: string; item_name: string; units: number; revenue_jod: number | null };
type HistRow = { month: string; label: string; talAvg: number | null; carAvg: number | null; combined: number | null };

/** Monthly avg selling price (incl VAT) per platform for one canonical item, from stored item sales.
 *  Monthly is the finest granularity the data supports, so a price change reads as a step. Combined
 *  is a true blend (total sales ÷ total units), never the mean of the two platform averages. */
function buildPriceHistory(allSales: SaleRow[], key: string, dbAliases: DbAliasMap): HistRow[] {
  const byMonth = new Map<string, { tU: number; tR: number; cU: number; cR: number }>();
  for (const s of allSales) {
    if (canonicalItemName(s.item_name, dbAliases) !== key) continue;
    const e = byMonth.get(s.month) ?? { tU: 0, tR: 0, cU: 0, cR: 0 };
    const u = Number(s.units) || 0;
    const rev = Number(s.revenue_jod ?? 0);
    if (s.platform === "Talabat") { e.tU += u; e.tR += rev; }
    else if (s.platform === "Careem") { e.cU += u; e.cR += rev; }
    byMonth.set(s.month, e);
  }
  return Array.from(byMonth.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([month, e]) => {
      const totU = e.tU + e.cU;
      const totR = e.tR + e.cR;
      return {
        month,
        label: monthLabel(month),
        talAvg: e.tU > 0 ? e.tR / e.tU : null,
        carAvg: e.cU > 0 ? e.cR / e.cU : null,
        combined: totU > 0 ? totR / totU : null,
      };
    });
}

function PriceHistoryDialog({
  item,
  allSales,
  dbAliases,
  onClose,
}: {
  item: { label: string; key: string } | null;
  allSales: SaleRow[];
  dbAliases: DbAliasMap;
  onClose: () => void;
}) {
  const history = useMemo(
    () => (item ? buildPriceHistory(allSales, item.key, dbAliases) : []),
    [item, allSales, dbAliases],
  );
  const cell = (v: number | null) =>
    v != null ? fmtJOD3(v) : <span className="text-muted-foreground">n/a</span>;

  return (
    <Dialog open={!!item} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{item?.label} price history</DialogTitle>
          <DialogDescription>
            Avg selling price (incl VAT) per month, from actual sales. Monthly is the finest
            granularity stored, so a month spanning a price change shows a blend, not a clean step.
          </DialogDescription>
        </DialogHeader>

        {history.length === 0 ? (
          <div className="text-sm text-muted-foreground py-8 text-center">
            No item sales recorded for this item yet.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="h-[200px]">
              <ResponsiveContainer>
                <LineChart data={history} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                  <CartesianGrid stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} />
                  <YAxis
                    stroke="var(--muted-foreground)"
                    fontSize={10}
                    tickLine={false}
                    axisLine={false}
                    width={44}
                    tickFormatter={(v) => Number(v).toFixed(1)}
                  />
                  <RTooltip
                    contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number, name: string) => [fmtJOD3(Number(v)), name]}
                  />
                  <Line isAnimationActive={false} type="stepAfter" dataKey="talAvg" name="Talabat" stroke="#FF5A00" strokeWidth={2} dot={{ r: 3, fill: "#FF5A00" }} connectNulls={false} />
                  <Line isAnimationActive={false} type="stepAfter" dataKey="carAvg" name="Careem" stroke="#1BD15D" strokeWidth={2} dot={{ r: 3, fill: "#1BD15D" }} connectNulls={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground border-b border-border">
                    <th className="text-left font-medium px-3 py-2">Month</th>
                    <th className="text-right font-medium px-3 py-2" style={{ color: "#FF5A00" }}>Talabat</th>
                    <th className="text-right font-medium px-3 py-2" style={{ color: "#1BD15D" }}>Careem</th>
                    <th className="text-right font-medium px-3 py-2">Combined</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.month} className="border-b border-border last:border-0">
                      <td className="px-3 py-1.5 font-medium whitespace-nowrap">{h.label}</td>
                      <td className="px-3 py-1.5 text-right text-num">{cell(h.talAvg)}</td>
                      <td className="px-3 py-1.5 text-right text-num">{cell(h.carAvg)}</td>
                      <td className="px-3 py-1.5 text-right text-num font-semibold">{cell(h.combined)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Combined is a true blend: total sales divided by total units across both platforms, not
              the average of the two platform figures.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Per-item category picker. Editing here assigns the canonical item's category (survives
 *  re-imports). Uncategorised is the muted default; picking it clears the assignment. */
function CategoryCell({
  value,
  onAssign,
  pending,
}: {
  value: string;
  onAssign: (category: string) => void;
  pending: boolean;
}) {
  const isDefault = value === UNCATEGORISED;
  return (
    <select
      value={value}
      disabled={pending}
      onChange={(e) => {
        if (e.target.value !== value) onAssign(e.target.value);
      }}
      aria-label="Item category"
      className={`w-[140px] rounded-md border border-border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 ${
        isDefault ? "text-muted-foreground" : "text-foreground"
      }`}
    >
      {ALL_CATEGORY_OPTIONS.map((c) => (
        <option key={c} value={c}>{c}</option>
      ))}
    </select>
  );
}

function PriceCell({ listPrice, ppUnits, ppRevenue }: {
  listPrice: number | null | undefined;
  ppUnits: number;
  ppRevenue: number;
}) {
  const realized = ppUnits > 0 ? ppRevenue / ppUnits : null;

  if (listPrice == null && realized == null) {
    return <span className="text-muted-foreground">n/a</span>;
  }

  if (listPrice == null) {
    // No list price entered — label the realized avg so it's not mistaken for a set price
    return <div className="text-[11px] text-muted-foreground">avg {fmtJOD(realized!)}</div>;
  }

  // Auto "discounted" flag: what customers actually paid vs the entered list price.
  // Only meaningful when both exist and the list price is positive; >5% below = discounted.
  const dropPct = realized != null && listPrice > 0 ? (1 - realized / listPrice) * 100 : null;
  // Strictly more than 5%, with a tolerance so an exact 5.0% drop isn't tripped by float noise.
  const discounted = dropPct != null && dropPct - 5 > 1e-9;

  // List price is set — bold headline, realized avg beneath
  return (
    <div>
      <div className="font-semibold">{fmtJOD(listPrice)}</div>
      {realized != null && (
        <div className="text-[10px] text-muted-foreground flex items-center justify-end gap-1 flex-wrap">
          <span>avg {fmtJOD(realized)}</span>
          {discounted && (
            <Badge
              variant="outline"
              className="text-[9px] px-1 py-0 h-auto font-normal text-muted-foreground"
              title="Average paid is below the entered list price (promos, vouchers or combo pricing)"
            >
              ↓ {Math.round(dropPct)}% vs list
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
