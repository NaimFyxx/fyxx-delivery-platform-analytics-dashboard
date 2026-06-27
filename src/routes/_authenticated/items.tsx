import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/fyxx/page-header";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { fmtJOD, fmtInt, currentMonth, platformBg, type Platform } from "@/lib/fyxx";

export const Route = createFileRoute("/_authenticated/items")({
  head: () => ({ meta: [{ title: "Items · TGR" }] }),
  component: Items,
});

function Items() {
  const [month, setMonth] = useState(currentMonth());
  const [platform, setPlatform] = useState<"all" | Platform>("all");
  const [q, setQ] = useState("");

  const { data: months = [] } = useQuery({
    queryKey: ["item_sales_months"],
    queryFn: async () => {
      const { data, error } = await supabase.from("monthly_item_sales").select("month");
      if (error) throw error;
      return Array.from(new Set((data ?? []).map((r) => r.month))).sort().reverse();
    },
  });

  const { data: sales = [] } = useQuery({
    queryKey: ["monthly_item_sales", month, platform],
    queryFn: async () => {
      let qy = supabase.from("monthly_item_sales").select("*").eq("month", month);
      if (platform !== "all") qy = qy.eq("platform", platform);
      const { data, error } = await qy;
      if (error) throw error;
      return data ?? [];
    },
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
      const { data, error } = await (supabase.from as any)("item_prices").select("*");
      if (error) throw error;
      return (data ?? []) as { item_name: string; platform: string; price_incl_vat: number }[];
    },
  });

  // "item_name|platform" → list price incl VAT
  const priceMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of prices) {
      map.set(`${p.item_name}|${p.platform}`, Number(p.price_incl_vat));
    }
    return map;
  }, [prices]);

  // Cost as of end of month (string comparison — month-31 is always ≥ any real date in that month)
  const monthEnd = `${month}-31`;
  const costFor = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of costs) {
      if (c.effective_from > monthEnd) continue;
      if (!map.has(c.item_name)) map.set(c.item_name, Number(c.cost_exvat));
    }
    return map;
  }, [costs, monthEnd]);

  const aggregated = useMemo(() => {
    type PerPlatform = { units: number; revenue: number };
    const map = new Map<string, {
      item: string;
      units: number;
      platforms: Set<string>;
      talabat: PerPlatform;
      careem: PerPlatform;
    }>();
    for (const s of sales) {
      if (!map.has(s.item_name)) {
        map.set(s.item_name, {
          item: s.item_name, units: 0, platforms: new Set(),
          talabat: { units: 0, revenue: 0 },
          careem: { units: 0, revenue: 0 },
        });
      }
      const e = map.get(s.item_name)!;
      e.units += s.units;
      e.platforms.add(s.platform);
      if (s.platform === "Talabat") {
        e.talabat.units += s.units;
        e.talabat.revenue += Number((s as any).revenue_jod ?? 0);
      } else if (s.platform === "Careem") {
        e.careem.units += s.units;
        e.careem.revenue += Number((s as any).revenue_jod ?? 0);
      }
    }
    return Array.from(map.values())
      .filter((r) => !q || r.item.toLowerCase().includes(q.toLowerCase()))
      .map((r) => ({
        ...r,
        cost: costFor.get(r.item) ?? null,
        totalCost: (costFor.get(r.item) ?? 0) * r.units,
      }))
      .sort((a, b) => b.units - a.units);
  }, [sales, costFor, q]);

  const monthOptions = months.length ? months : [currentMonth()];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader title="Items" description="Popular dishes per month with COGS and per-platform selling prices." />
      <div className="flex flex-wrap gap-3 mb-4">
        <Select value={month} onValueChange={setMonth}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>{monthOptions.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={platform} onValueChange={(v) => setPlatform(v as typeof platform)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All platforms</SelectItem>
            <SelectItem value="Talabat">Talabat</SelectItem>
            <SelectItem value="Careem">Careem</SelectItem>
          </SelectContent>
        </Select>
        <Input placeholder="Search items…" value={q} onChange={(e) => setQ(e.target.value)} className="w-64" />
      </div>

      <Card className="p-0 overflow-hidden overflow-x-auto">
        <Table className="min-w-[700px]">
          <TableHeader>
            <TableRow>
              <TableHead>Item</TableHead>
              <TableHead>Platforms</TableHead>
              <TableHead className="text-right">Units</TableHead>
              <TableHead className="text-right">Talabat</TableHead>
              <TableHead className="text-right">Careem</TableHead>
              <TableHead className="text-right">Unit cost (ex-VAT)</TableHead>
              <TableHead className="text-right">Total COGS</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {aggregated.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-12">
                  No item sales for {month}.
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
                    listPrice={priceMap.get(`${r.item}|Talabat`)}
                    ppUnits={r.talabat.units}
                    ppRevenue={r.talabat.revenue}
                  />
                </TableCell>
                <TableCell className="text-right text-num">
                  <PriceCell
                    listPrice={priceMap.get(`${r.item}|Careem`)}
                    ppUnits={r.careem.units}
                    ppRevenue={r.careem.revenue}
                  />
                </TableCell>
                <TableCell className="text-right text-num">
                  {r.cost == null ? <span className="text-muted-foreground">—</span> : fmtJOD(r.cost)}
                </TableCell>
                <TableCell className="text-right text-num">
                  {r.cost == null ? <span className="text-muted-foreground">—</span> : fmtJOD(r.totalCost)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function PriceCell({ listPrice, ppUnits, ppRevenue }: {
  listPrice: number | undefined;
  ppUnits: number;
  ppRevenue: number;
}) {
  const realized = ppUnits > 0 ? ppRevenue / ppUnits : null;

  if (listPrice == null && realized == null) {
    return <span className="text-muted-foreground">—</span>;
  }

  const primary = listPrice != null ? listPrice : realized!;
  const secondary = listPrice != null && realized != null ? realized : null;

  return (
    <div>
      <div className="font-semibold">{fmtJOD(primary)}</div>
      {secondary != null && (
        <div className="text-[10px] text-muted-foreground">avg {fmtJOD(secondary)}</div>
      )}
    </div>
  );
}
