import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/fyxx/page-header";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { fmtJOD, fmtInt, fmtPct, currentMonth, platformBg, PLATFORMS, type Platform } from "@/lib/fyxx";

export const Route = createFileRoute("/_authenticated/targets")({
  head: () => ({ meta: [{ title: "Targets · Fyxx" }] }),
  component: TargetsPage,
});

function TargetsPage() {
  const [month, setMonth] = useState(currentMonth());

  const { data: targets = [] } = useQuery({
    queryKey: ["targets", month],
    queryFn: async () => {
      const { data, error } = await supabase.from("targets").select("*").eq("month", month);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: sales = [] } = useQuery({
    queryKey: ["daily_sales_month", month],
    queryFn: async () => {
      const start = `${month}-01`;
      // simple end-of-month: month-31 works as upper bound for date comparison
      const end = `${month}-31`;
      const { data, error } = await supabase
        .from("daily_sales").select("*").gte("date", start).lte("date", end);
      if (error) throw error;
      return data ?? [];
    },
  });

  const actualsByPlatform = useMemo(() => {
    const m: Record<Platform, { sales: number; orders: number }> = {
      Talabat: { sales: 0, orders: 0 },
      Careem: { sales: 0, orders: 0 },
    };
    for (const r of sales) {
      m[r.platform as Platform].sales += Number(r.sales_jod);
      m[r.platform as Platform].orders += r.orders;
    }
    return m;
  }, [sales]);

  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader title="Targets vs actuals" description="Monthly sales and order targets for each platform." actions={
        <Select value={month} onValueChange={setMonth}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>{months.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}</SelectContent>
        </Select>
      } />

      <div className="grid gap-4 md:grid-cols-2">
        {PLATFORMS.map((p) => {
          const t = targets.find((x) => x.platform === p);
          const a = actualsByPlatform[p];
          const salesT = Number(t?.sales_target_jod ?? 0);
          const ordersT = Number(t?.orders_target ?? 0);
          const salesPct = salesT ? Math.min(a.sales / salesT, 1) : 0;
          const ordersPct = ordersT ? Math.min(a.orders / ordersT, 1) : 0;
          return (
            <Card key={p} className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display text-xl font-semibold">{p}</h3>
                <Badge variant="outline" className={platformBg(p)}>{month}</Badge>
              </div>
              {!t ? (
                <p className="text-sm text-muted-foreground">No target set. Add one on the Data entry page.</p>
              ) : (
                <div className="space-y-5">
                  <Row label="Sales (gross)" actual={fmtJOD(a.sales)} target={fmtJOD(salesT)} pct={salesPct} />
                  <Row label="Orders" actual={fmtInt(a.orders)} target={fmtInt(ordersT)} pct={ordersPct} />
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function Row({ label, actual, target, pct }: { label: string; actual: string; target: string; pct: number }) {
  return (
    <div>
      <div className="flex items-end justify-between mb-2 text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="text-num"><span className="font-semibold">{actual}</span> <span className="text-muted-foreground">/ {target}</span></span>
      </div>
      <Progress value={pct * 100} className="h-3" />
      <div className="mt-1 text-xs text-muted-foreground text-right text-num">{fmtPct(pct)}</div>
    </div>
  );
}