import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/fyxx/page-header";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PLATFORMS, currentMonth, platformBg, fmtJOD, fmtInt, type Platform } from "@/lib/fyxx";

export const Route = createFileRoute("/_authenticated/entry")({
  head: () => ({ meta: [{ title: "Data entry · Fyxx" }] }),
  component: Entry,
});

function Entry() {
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <PageHeader title="Data entry" description="Add or update sales, financials, item costs and targets. Existing rows for the same key are overwritten — item costs are append-only and versioned." />
      <Tabs defaultValue="daily">
        <TabsList className="grid grid-cols-2 md:grid-cols-5 w-full">
          <TabsTrigger value="daily">Daily sales</TabsTrigger>
          <TabsTrigger value="financials">Financials</TabsTrigger>
          <TabsTrigger value="costs">Item costs</TabsTrigger>
          <TabsTrigger value="items">Item sales</TabsTrigger>
          <TabsTrigger value="targets">Targets</TabsTrigger>
        </TabsList>
        <TabsContent value="daily"><DailySalesForm /></TabsContent>
        <TabsContent value="financials"><FinancialsForm /></TabsContent>
        <TabsContent value="costs"><ItemCostsForm /></TabsContent>
        <TabsContent value="items"><ItemSalesForm /></TabsContent>
        <TabsContent value="targets"><TargetsForm /></TabsContent>
      </Tabs>
    </div>
  );
}

function useInvalidateAll() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries();
}

/* ---------- Daily sales ---------- */
function DailySalesForm() {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [platform, setPlatform] = useState<Platform>("Talabat");
  const [sales, setSales] = useState("");
  const [orders, setOrders] = useState("");
  const invalidate = useInvalidateAll();

  const { data: rows = [] } = useQuery({
    queryKey: ["entry_daily"],
    queryFn: async () => {
      const { data, error } = await supabase.from("daily_sales").select("*").order("date", { ascending: false }).limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("daily_sales").upsert(
        { date, platform, sales_jod: Number(sales), orders: Number(orders) },
        { onConflict: "date,platform" },
      );
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Saved"); setSales(""); setOrders(""); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("daily_sales").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Deleted"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6 mt-4">
      <Card className="p-5">
        <form className="grid gap-4 md:grid-cols-5" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <Field label="Date"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required /></Field>
          <Field label="Platform"><PlatformSelect value={platform} onChange={setPlatform} /></Field>
          <Field label="Gross sales (JOD)"><Input type="number" step="0.001" min="0" value={sales} onChange={(e) => setSales(e.target.value)} required /></Field>
          <Field label="Orders"><Input type="number" step="1" min="0" value={orders} onChange={(e) => setOrders(e.target.value)} required /></Field>
          <SubmitBtn pending={save.isPending} />
        </form>
      </Card>
      <RecentTable
        title="Last 20 entries"
        headers={["Date", "Platform", "Sales", "Orders", ""]}
        rows={rows.map((r) => [
          r.date,
          <Badge key="p" variant="outline" className={platformBg(r.platform as Platform)}>{r.platform}</Badge>,
          fmtJOD(Number(r.sales_jod)),
          fmtInt(r.orders),
          <DeleteBtn key="d" onClick={() => del.mutate(r.id)} />,
        ])}
      />
    </div>
  );
}

/* ---------- Monthly financials ---------- */
function FinancialsForm() {
  const [month, setMonth] = useState(currentMonth());
  const [platform, setPlatform] = useState<Platform>("Talabat");
  const [gross, setGross] = useState("");
  const [payout, setPayout] = useState("");
  const [cogs, setCogs] = useState("");
  const invalidate = useInvalidateAll();

  const { data: rows = [] } = useQuery({
    queryKey: ["entry_financials"],
    queryFn: async () => {
      const { data, error } = await supabase.from("monthly_financials").select("*").order("month", { ascending: false }).limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("monthly_financials").upsert(
        { month, platform, gross_sales: Number(gross), actual_payout: Number(payout), cogs: Number(cogs) },
        { onConflict: "month,platform" },
      );
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Saved"); setGross(""); setPayout(""); setCogs(""); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("monthly_financials").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Deleted"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6 mt-4">
      <Card className="p-5">
        <form className="grid gap-4 md:grid-cols-6" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <Field label="Month (YYYY-MM)"><Input value={month} onChange={(e) => setMonth(e.target.value)} pattern="\d{4}-\d{2}" required /></Field>
          <Field label="Platform"><PlatformSelect value={platform} onChange={setPlatform} /></Field>
          <Field label="Gross sales"><Input type="number" step="0.001" value={gross} onChange={(e) => setGross(e.target.value)} required /></Field>
          <Field label="Actual payout"><Input type="number" step="0.001" value={payout} onChange={(e) => setPayout(e.target.value)} required /></Field>
          <Field label="COGS (ex-VAT)"><Input type="number" step="0.001" value={cogs} onChange={(e) => setCogs(e.target.value)} required /></Field>
          <SubmitBtn pending={save.isPending} />
        </form>
      </Card>
      <RecentTable
        title="Recent financials"
        headers={["Month", "Platform", "Gross", "Payout", "COGS", ""]}
        rows={rows.map((r) => [
          r.month,
          <Badge key="p" variant="outline" className={platformBg(r.platform as Platform)}>{r.platform}</Badge>,
          fmtJOD(Number(r.gross_sales)),
          fmtJOD(Number(r.actual_payout)),
          fmtJOD(Number(r.cogs)),
          <DeleteBtn key="d" onClick={() => del.mutate(r.id)} />,
        ])}
      />
    </div>
  );
}

/* ---------- Item costs (versioned) ---------- */
function ItemCostsForm() {
  const [item, setItem] = useState("");
  const [cost, setCost] = useState("");
  const [from, setFrom] = useState(new Date().toISOString().slice(0, 10));
  const invalidate = useInvalidateAll();

  const { data: rows = [] } = useQuery({
    queryKey: ["entry_costs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("item_costs").select("*").order("effective_from", { ascending: false }).limit(40);
      if (error) throw error;
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("item_costs").insert({
        item_name: item.trim(), cost_exvat: Number(cost), effective_from: from,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Cost version added"); setItem(""); setCost(""); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("item_costs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Deleted"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6 mt-4">
      <Card className="p-5">
        <p className="text-xs text-muted-foreground mb-3">Each save adds a new version. The dashboard uses the latest version on or before the requested month.</p>
        <form className="grid gap-4 md:grid-cols-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <Field label="Item name"><Input value={item} onChange={(e) => setItem(e.target.value)} required placeholder="e.g. Chicken Shawarma" /></Field>
          <Field label="Cost (ex-VAT, JOD)"><Input type="number" step="0.0001" min="0" value={cost} onChange={(e) => setCost(e.target.value)} required /></Field>
          <Field label="Effective from"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} required /></Field>
          <SubmitBtn pending={save.isPending} />
        </form>
      </Card>
      <RecentTable
        title="Cost history"
        headers={["Item", "Cost (ex-VAT)", "Effective from", ""]}
        rows={rows.map((r) => [
          r.item_name,
          fmtJOD(Number(r.cost_exvat)),
          r.effective_from,
          <DeleteBtn key="d" onClick={() => del.mutate(r.id)} />,
        ])}
      />
    </div>
  );
}

/* ---------- Monthly item sales ---------- */
function ItemSalesForm() {
  const [month, setMonth] = useState(currentMonth());
  const [platform, setPlatform] = useState<Platform>("Talabat");
  const [item, setItem] = useState("");
  const [units, setUnits] = useState("");
  const invalidate = useInvalidateAll();

  const { data: rows = [] } = useQuery({
    queryKey: ["entry_item_sales"],
    queryFn: async () => {
      const { data, error } = await supabase.from("monthly_item_sales").select("*").order("month", { ascending: false }).limit(30);
      if (error) throw error;
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("monthly_item_sales").upsert(
        { month, platform, item_name: item.trim(), units: Number(units) },
        { onConflict: "month,platform,item_name" },
      );
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Saved"); setItem(""); setUnits(""); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("monthly_item_sales").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Deleted"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6 mt-4">
      <Card className="p-5">
        <form className="grid gap-4 md:grid-cols-5" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <Field label="Month"><Input value={month} onChange={(e) => setMonth(e.target.value)} pattern="\d{4}-\d{2}" required /></Field>
          <Field label="Platform"><PlatformSelect value={platform} onChange={setPlatform} /></Field>
          <Field label="Item"><Input value={item} onChange={(e) => setItem(e.target.value)} required /></Field>
          <Field label="Units"><Input type="number" min="0" step="1" value={units} onChange={(e) => setUnits(e.target.value)} required /></Field>
          <SubmitBtn pending={save.isPending} />
        </form>
      </Card>
      <RecentTable
        title="Recent item sales"
        headers={["Month", "Platform", "Item", "Units", ""]}
        rows={rows.map((r) => [
          r.month,
          <Badge key="p" variant="outline" className={platformBg(r.platform as Platform)}>{r.platform}</Badge>,
          r.item_name,
          fmtInt(r.units),
          <DeleteBtn key="d" onClick={() => del.mutate(r.id)} />,
        ])}
      />
    </div>
  );
}

/* ---------- Targets ---------- */
function TargetsForm() {
  const [month, setMonth] = useState(currentMonth());
  const [platform, setPlatform] = useState<Platform>("Talabat");
  const [salesT, setSalesT] = useState("");
  const [ordersT, setOrdersT] = useState("");
  const invalidate = useInvalidateAll();

  const { data: rows = [] } = useQuery({
    queryKey: ["entry_targets"],
    queryFn: async () => {
      const { data, error } = await supabase.from("targets").select("*").order("month", { ascending: false }).limit(20);
      if (error) throw error;
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("targets").upsert(
        { month, platform, sales_target_jod: Number(salesT), orders_target: Number(ordersT) },
        { onConflict: "month,platform" },
      );
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Saved"); setSalesT(""); setOrdersT(""); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("targets").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Deleted"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6 mt-4">
      <Card className="p-5">
        <form className="grid gap-4 md:grid-cols-5" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <Field label="Month"><Input value={month} onChange={(e) => setMonth(e.target.value)} pattern="\d{4}-\d{2}" required /></Field>
          <Field label="Platform"><PlatformSelect value={platform} onChange={setPlatform} /></Field>
          <Field label="Sales target (JOD)"><Input type="number" step="0.001" min="0" value={salesT} onChange={(e) => setSalesT(e.target.value)} required /></Field>
          <Field label="Orders target"><Input type="number" min="0" step="1" value={ordersT} onChange={(e) => setOrdersT(e.target.value)} required /></Field>
          <SubmitBtn pending={save.isPending} />
        </form>
      </Card>
      <RecentTable
        title="Targets"
        headers={["Month", "Platform", "Sales target", "Orders target", ""]}
        rows={rows.map((r) => [
          r.month,
          <Badge key="p" variant="outline" className={platformBg(r.platform as Platform)}>{r.platform}</Badge>,
          fmtJOD(Number(r.sales_target_jod)),
          fmtInt(r.orders_target),
          <DeleteBtn key="d" onClick={() => del.mutate(r.id)} />,
        ])}
      />
    </div>
  );
}

/* ---------- Shared bits ---------- */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}
function PlatformSelect({ value, onChange }: { value: Platform; onChange: (v: Platform) => void }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as Platform)}>
      <SelectTrigger><SelectValue /></SelectTrigger>
      <SelectContent>{PLATFORMS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
    </Select>
  );
}
function SubmitBtn({ pending }: { pending: boolean }) {
  return (
    <div className="flex items-end">
      <Button type="submit" className="w-full bg-gradient-primary text-primary-foreground" disabled={pending}>
        {pending && <Loader2 className="size-4 animate-spin mr-2" />}Save
      </Button>
    </div>
  );
}
function DeleteBtn({ onClick }: { onClick: () => void }) {
  return (
    <Button size="sm" variant="ghost" onClick={onClick} className="text-muted-foreground hover:text-destructive">
      <Trash2 className="size-4" />
    </Button>
  );
}
function RecentTable({ title, headers, rows }: { title: string; headers: string[]; rows: React.ReactNode[][] }) {
  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-5 py-3 border-b border-border text-sm font-semibold">{title}</div>
      <Table>
        <TableHeader>
          <TableRow>{headers.map((h, i) => <TableHead key={i} className={i >= headers.length - 2 ? "text-right" : ""}>{h}</TableHead>)}</TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 && <TableRow><TableCell colSpan={headers.length} className="text-center text-sm text-muted-foreground py-8">No entries yet.</TableCell></TableRow>}
          {rows.map((cells, i) => (
            <TableRow key={i}>
              {cells.map((c, j) => <TableCell key={j} className={j >= cells.length - 2 ? "text-right text-num" : ""}>{c}</TableCell>)}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}