import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/fyxx/page-header";
import { StatCard } from "@/components/fyxx/stat-card";
import { Card } from "@/components/ui/card";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { fmtJOD, fmtInt, exVat, vatOf, PLATFORMS, type Platform } from "@/lib/fyxx";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { TrendingUp, ShoppingBag, Receipt, Wallet } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Overview · Fyxx" }] }),
  component: Dashboard,
});

const RANGES = { "7": "Last 7 days", "30": "Last 30 days", "90": "Last 90 days", "365": "Last year" } as const;
type RangeKey = keyof typeof RANGES;

function Dashboard() {
  const [range, setRange] = useState<RangeKey>("30");
  const days = Number(range);
  const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);

  const { data, isLoading } = useQuery({
    queryKey: ["daily_sales", since],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("daily_sales")
        .select("*")
        .gte("date", since)
        .order("date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });

  const rows = data ?? [];
  const totals = rows.reduce(
    (acc, r) => {
      acc.gross += Number(r.sales_jod);
      acc.orders += r.orders;
      acc[r.platform === "Talabat" ? "talabat" : "careem"] += Number(r.sales_jod);
      return acc;
    },
    { gross: 0, orders: 0, talabat: 0, careem: 0 },
  );

  // Build per-day chart series
  const byDate = new Map<string, { date: string; Talabat: number; Careem: number; orders: number }>();
  rows.forEach((r) => {
    const key = r.date;
    if (!byDate.has(key)) byDate.set(key, { date: key, Talabat: 0, Careem: 0, orders: 0 });
    const e = byDate.get(key)!;
    e[r.platform as Platform] = Number(r.sales_jod);
    e.orders += r.orders;
  });
  const series = Array.from(byDate.values());

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Overview"
        description="Live snapshot of Talabat and Careem performance."
        actions={
          <Select value={range} onValueChange={(v) => setRange(v as RangeKey)}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(RANGES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <StatCard accent label="Gross sales" value={fmtJOD(totals.gross)} sub={`incl. ${fmtJOD(vatOf(totals.gross))} VAT`} icon={<TrendingUp className="size-5" />} />
        <StatCard label="Net (ex-VAT)" value={fmtJOD(exVat(totals.gross))} sub="Sales without 16% VAT" icon={<Wallet className="size-5" />} />
        <StatCard label="Orders" value={fmtInt(totals.orders)} sub={`avg ${totals.orders ? fmtJOD(totals.gross / totals.orders) : "—"} / order`} icon={<ShoppingBag className="size-5" />} />
        <StatCard label="Split" value={
          <span className="flex gap-2 items-baseline">
            <span className="text-talabat">{totals.gross ? Math.round(totals.talabat / totals.gross * 100) : 0}%</span>
            <span className="text-muted-foreground text-base">·</span>
            <span className="text-careem">{totals.gross ? Math.round(totals.careem / totals.gross * 100) : 0}%</span>
          </span>
        } sub="Talabat · Careem" icon={<Receipt className="size-5" />} />
      </div>

      <Card className="p-5 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-lg font-semibold">Daily sales</h3>
          <div className="text-xs text-muted-foreground">JOD, gross incl. VAT</div>
        </div>
        <div className="h-72">
          {isLoading ? <Skeleton /> : series.length === 0 ? <Empty /> : (
            <ResponsiveContainer>
              <BarChart data={series}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} />
                <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Talabat" fill="var(--talabat)" stackId="a" radius={[0, 0, 0, 0]} />
                <Bar dataKey="Careem" fill="var(--careem)" stackId="a" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-lg font-semibold">Orders trend</h3>
        </div>
        <div className="h-56">
          {isLoading ? <Skeleton /> : series.length === 0 ? <Empty /> : (
            <ResponsiveContainer>
              <LineChart data={series}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" stroke="var(--muted-foreground)" fontSize={11} />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} />
                <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 }} />
                <Line type="monotone" dataKey="orders" stroke="var(--primary)" strokeWidth={2.5} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>
    </div>
  );
}

function Skeleton() {
  return <div className="h-full w-full animate-pulse bg-muted/40 rounded-md" />;
}
function Empty() {
  return <div className="h-full flex flex-col items-center justify-center text-center text-sm text-muted-foreground gap-2">
    <div>No sales in this range.</div>
    <div className="text-xs">Add data on the Data entry page.</div>
  </div>;
}