import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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
import { AlertTriangle, Loader2, Trash2, Upload } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { PLATFORMS, currentMonth, platformBg, fmtJOD, fmtInt, logImport, type Platform, type PlatformKey } from "@/lib/fyxx";
import { DatePicker, MonthPicker } from "@/components/fyxx/date-picker";
import { parseCsv, parseDate, num, round3, isDelivered } from "@/lib/csv-import";

export const Route = createFileRoute("/_authenticated/entry")({
  head: () => ({ meta: [{ title: "Data entry · TGR" }] }),
  component: Entry,
});

function Entry() {
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <PageHeader title="Data entry" description="Pace tracker entries feed the pace bar only — they are separate from imported data. Item costs, menu prices and targets are also entered here." />
      <Tabs defaultValue="daily">
        <TabsList className="grid grid-cols-2 md:grid-cols-5 w-full">
          <TabsTrigger value="daily">Pace tracker</TabsTrigger>
          <TabsTrigger value="costs">Item costs</TabsTrigger>
          <TabsTrigger value="prices">Menu prices</TabsTrigger>
          <TabsTrigger value="targets">Targets</TabsTrigger>
          <TabsTrigger value="clear" className="text-destructive data-[state=active]:text-destructive">Clear month</TabsTrigger>
        </TabsList>
        <TabsContent value="daily"><DailySalesForm /></TabsContent>
        <TabsContent value="costs"><ItemCostsForm /></TabsContent>
        <TabsContent value="prices"><MenuPricesForm /></TabsContent>
        <TabsContent value="targets"><TargetsForm /></TabsContent>
        <TabsContent value="clear"><ClearMonthForm /></TabsContent>
      </Tabs>
    </div>
  );
}

function useInvalidateAll() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries();
}

/* ---------- Pace tracker (manual daily sales — feeds pace bar only) ---------- */
function DailySalesForm() {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [platform, setPlatform] = useState<Platform>("Talabat");
  const [sales, setSales] = useState("");
  const [orders, setOrders] = useState("");
  const invalidate = useInvalidateAll();

  const filter = useListFilter();
  const { data: rows = [] } = useQuery({
    queryKey: ["entry_pace_daily"],
    queryFn: async () => {
      const { data, error } = await supabase.from("pace_daily").select("*").order("date", { ascending: false }).limit(1000);
      if (error) throw error;
      return data ?? [];
    },
  });
  const months = useMemo(
    () => Array.from(new Set(rows.map((r) => r.date.slice(0, 7)))).sort().reverse(),
    [rows],
  );
  const filtered = applyListFilter(rows, filter, (r) => r.date.slice(0, 7));

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("pace_daily").upsert(
        { date, platform, sales_jod: Number(sales), orders: orders ? Number(orders) : null },
        { onConflict: "date,platform" },
      );
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Saved"); setSales(""); setOrders(""); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("pace_daily").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Deleted"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6 mt-4">
      <Card className="p-5">
        <p className="text-xs text-muted-foreground mb-3">These entries power the pace tracker only. Imported CSV data is stored separately and is not affected.</p>
        <form className="grid gap-4 md:grid-cols-5" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <Field label="Date"><DatePicker value={date} onChange={setDate} /></Field>
          <Field label="Platform"><PlatformSelect value={platform} onChange={setPlatform} /></Field>
          <Field label="Gross sales (JOD)"><Input type="number" step="0.001" min="0" value={sales} onChange={(e) => setSales(e.target.value)} required /></Field>
          <Field label="Orders (optional)"><Input type="number" step="1" min="0" value={orders} onChange={(e) => setOrders(e.target.value)} /></Field>
          <SubmitBtn pending={save.isPending} />
        </form>
      </Card>
      <PaceCsvImport onImported={invalidate} />
      <RecentTable
        title="Pace entries"
        right={<ListFilterBar f={filter} months={months} />}
        headers={["Date", "Platform", "Sales", "Orders", ""]}
        rows={filtered.map((r) => [
          r.date,
          <Badge key="p" variant="outline" className={platformBg(r.platform as Platform)}>{r.platform}</Badge>,
          fmtJOD(Number(r.sales_jod)),
          r.orders != null ? fmtInt(r.orders) : <span className="text-muted-foreground">—</span>,
          <DeleteBtn key="d" onClick={() => del.mutate(r.id)} />,
        ])}
      />
    </div>
  );
}

/* ---------- Pace tracker CSV import (order-detail → one daily gross per date) ---------- */
// Which columns to read per platform from an order-detail export.
//  - entryTypeCols: if set, keep only rows whose value is FOOD_ORDER.
//  - statusCols: if set, keep only delivered rows.
// Careem reads the Order Level export (TOTAL_AMOUNT is gross, incl. Plus discounts) so the pace
// tracker matches the financials — NOT the Recent Orders export whose order_amount is net.
const PACE_IMPORT: Record<
  Platform,
  { dateCols: string[]; grossCols: string[]; entryTypeCols?: string[]; statusCols?: string[]; note: string }
> = {
  Talabat: {
    dateCols: ["Order received at", "Order Received At"],
    grossCols: ["Subtotal"],
    note: "Talabat: sums Subtotal (gross) grouped by the ‘Order received at’ date.",
  },
  Careem: {
    dateCols: ["TRANSACTION_DATE"],
    grossCols: ["TOTAL_AMOUNT"],
    entryTypeCols: ["ENTRY_TYPE"],
    statusCols: ["STATUS"],
    note: "Careem: from the Order Level export — sums TOTAL_AMOUNT (gross) for delivered FOOD_ORDER rows, grouped by TRANSACTION_DATE.",
  },
};

function findHeader(headers: string[], candidates: string[]): string | null {
  const lower = headers.map((h) => h.toLowerCase().trim());
  for (const c of candidates) {
    const idx = lower.indexOf(c.toLowerCase().trim());
    if (idx >= 0) return headers[idx];
  }
  return null;
}

type PaceRow = { date: string; sales: number; orders: number };

function PaceCsvImport({ onImported }: { onImported: () => void }) {
  const [platform, setPlatform] = useState<Platform>("Talabat");
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<PaceRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setPreview(null);
    setError(null);
    setFileName(null);
  }

  async function onFile(f: File | null) {
    reset();
    setFileName(f?.name ?? null);
    if (!f) return;
    const cfg = PACE_IMPORT[platform];
    try {
      const text = await f.text();
      const { headers, rows } = parseCsv(text);
      const dateCol = findHeader(headers, cfg.dateCols);
      const grossCol = findHeader(headers, cfg.grossCols);
      if (!dateCol || !grossCol) {
        setError(
          `Couldn't find the expected ${platform} columns. Need a date column (${cfg.dateCols.join(" / ")}) and a gross column (${cfg.grossCols.join(" / ")}). This file has: ${headers.join(", ")}`,
        );
        return;
      }
      const entryCol = cfg.entryTypeCols ? findHeader(headers, cfg.entryTypeCols) : null;
      const statusCol = cfg.statusCols ? findHeader(headers, cfg.statusCols) : null;
      const byDate = new Map<string, { sales: number; orders: number }>();
      for (const r of rows) {
        // Careem Order Level: keep only delivered FOOD_ORDER rows (matches the financials).
        if (entryCol && String(r[entryCol] ?? "").trim().toUpperCase() !== "FOOD_ORDER") continue;
        if (statusCol && !isDelivered(r[statusCol])) continue;
        const d = parseDate(String(r[dateCol] ?? "").slice(0, 10));
        if (!d) continue;
        const cur = byDate.get(d) ?? { sales: 0, orders: 0 };
        cur.sales += num(r[grossCol]);
        cur.orders += 1;
        byDate.set(d, cur);
      }
      const out = Array.from(byDate.entries())
        .map(([date, v]) => ({ date, sales: round3(v.sales), orders: v.orders }))
        .sort((a, b) => a.date.localeCompare(b.date));
      if (!out.length) {
        setError("No dated rows found in this file.");
        return;
      }
      setPreview(out);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const importMut = useMutation({
    mutationFn: async () => {
      if (!preview) return;
      const payload = preview.map((p) => ({
        date: p.date,
        platform,
        sales_jod: p.sales,
        orders: null as number | null,
      }));
      for (let i = 0; i < payload.length; i += 500) {
        const { error } = await supabase
          .from("pace_daily")
          .upsert(payload.slice(i, i + 500), { onConflict: "date,platform" });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(`Imported ${preview?.length ?? 0} day(s) to ${platform}`);
      reset();
      onImported();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const total = preview?.reduce((s, p) => s + p.sales, 0) ?? 0;

  return (
    <Card className="p-5">
      <div className="text-sm font-semibold mb-1">Or import a CSV</div>
      <p className="text-xs text-muted-foreground mb-3">
        Upload a Talabat or Careem order-detail export — it sums gross sales per day and writes one
        figure per date into the pace tracker (same as entering it by hand). Re-importing replaces
        those dates.
      </p>
      <div className="grid gap-4 md:grid-cols-[200px_1fr] md:items-end">
        <Field label="Platform">
          <PlatformSelect value={platform} onChange={(p) => { setPlatform(p); reset(); }} />
        </Field>
        <div className="space-y-1.5">
          <Label className="text-xs">CSV file</Label>
          <div className="flex items-center gap-3">
            <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-card hover:bg-accent text-sm">
              <Upload className="size-4" />
              {fileName ? "Replace file" : "Choose CSV"}
              <input
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => onFile(e.target.files?.[0] ?? null)}
              />
            </label>
            {fileName && <span className="text-xs text-muted-foreground">{fileName}</span>}
          </div>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground mt-2">{PACE_IMPORT[platform].note}</p>

      {error && (
        <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      {preview && (
        <div className="mt-4 space-y-3">
          <div className="text-xs text-muted-foreground">
            {preview.length} day(s) · total gross{" "}
            <span className="font-semibold text-foreground">{fmtJOD(total)}</span>
          </div>
          <div className="border border-border rounded-md max-h-64 overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Orders</TableHead>
                  <TableHead className="text-right">Gross sales</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.map((p) => (
                  <TableRow key={p.date}>
                    <TableCell>{p.date}</TableCell>
                    <TableCell className="text-right text-num">{fmtInt(p.orders)}</TableCell>
                    <TableCell className="text-right text-num">{fmtJOD(p.sales)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <Button
            onClick={() => importMut.mutate()}
            disabled={importMut.isPending}
            className="bg-gradient-primary text-primary-foreground"
          >
            {importMut.isPending && <Loader2 className="size-4 animate-spin mr-2" />}
            Confirm — write {preview.length} day(s) to {platform}
          </Button>
        </div>
      )}
    </Card>
  );
}

/* ---------- Menu prices ---------- */
function MenuPricesForm() {
  const [item, setItem] = useState("");
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [platform, setPlatform] = useState<Platform>("Talabat");
  const [price, setPrice] = useState("");
  const [from, setFrom] = useState(new Date().toISOString().slice(0, 10));
  const [q, setQ] = useState("");
  const invalidate = useInvalidateAll();

  const { data: costRows = [] } = useQuery({
    queryKey: ["entry_costs_names"],
    queryFn: async () => {
      const { data, error } = await supabase.from("item_costs").select("item_name").order("item_name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: priceRows = [] } = useQuery({
    queryKey: ["entry_item_prices"],
    queryFn: async () => {
      const { data, error } = await supabase.from("item_prices").select("*").order("effective_from", { ascending: false }).limit(1000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const itemNames = useMemo(
    () => Array.from(new Set([
      ...costRows.map((r: { item_name: string }) => r.item_name),
      ...priceRows.map((r) => r.item_name),
    ])).sort() as string[],
    [costRows, priceRows],
  );

  const today = new Date().toISOString().slice(0, 10);
  const currentIds = useMemo(() => {
    const byKey = new Map<string, { id: string; date: string }>();
    for (const r of priceRows) {
      if (r.effective_from > today) continue;
      const key = `${r.item_name}|${r.platform}`;
      const cur = byKey.get(key);
      if (!cur || r.effective_from > cur.date) byKey.set(key, { id: r.id, date: r.effective_from });
    }
    return new Set(Array.from(byKey.values()).map((v) => v.id));
  }, [priceRows, today]);

  const save = useMutation({
    mutationFn: async () => {
      const name = item.trim();
      if (!name) throw new Error("Item name is required");
      const { error } = await supabase.from("item_prices").insert({
        item_name: name, platform, price_incl_vat: Number(price), effective_from: from,
      });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Price version added"); setPrice(""); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("item_prices").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Deleted"); invalidate(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6 mt-4">
      <Card className="p-5">
        <p className="text-xs text-muted-foreground mb-3">Each save adds a new version. The Items table shows the price effective as of the selected month.</p>
        <form className="grid gap-4 md:grid-cols-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <Field label="Item name">
            {mode === "existing" ? (
              <Select value={item} onValueChange={(v) => { if (v === "__new__") { setMode("new"); setItem(""); } else setItem(v); }}>
                <SelectTrigger><SelectValue placeholder="Select item" /></SelectTrigger>
                <SelectContent>
                  {itemNames.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                  <SelectItem value="__new__" className="text-primary">+ Add new item</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <div className="flex gap-2">
                <Input value={item} onChange={(e) => setItem(e.target.value)} required placeholder="New item name" autoFocus />
                <Button type="button" variant="ghost" size="sm" onClick={() => { setMode("existing"); setItem(""); }}>Cancel</Button>
              </div>
            )}
          </Field>
          <Field label="Platform"><PlatformSelect value={platform} onChange={setPlatform} /></Field>
          <Field label="Price (incl VAT, JOD)"><Input type="number" step="0.001" min="0" value={price} onChange={(e) => setPrice(e.target.value)} required /></Field>
          <Field label="Effective from"><DatePicker value={from} onChange={setFrom} /></Field>
          <SubmitBtn pending={save.isPending} />
        </form>
      </Card>
      <RecentTable
        title="Price history"
        right={
          <Input
            placeholder="Search items…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-8 w-48 text-xs"
          />
        }
        headers={["Item", "Platform", "Price (incl VAT)", "Effective from", "Status", ""]}
        rows={priceRows
          .filter((r) => !q || r.item_name.toLowerCase().includes(q.toLowerCase()))
          .map((r) => {
            const isCurrent = currentIds.has(r.id);
            const isFuture = r.effective_from > today;
            return [
              r.item_name,
              <Badge key="p" variant="outline" className={platformBg(r.platform as Platform)}>{r.platform}</Badge>,
              fmtJOD(Number(r.price_incl_vat)),
              r.effective_from,
              isFuture ? (
                <Badge key="s" variant="outline" className="bg-primary/10 text-primary border-primary/30">scheduled</Badge>
              ) : isCurrent ? (
                <Badge key="s" variant="outline" className="bg-success/15 text-success border-success/30">current</Badge>
              ) : (
                <Badge key="s" variant="outline" className="text-muted-foreground">superseded</Badge>
              ),
              <DeleteBtn key="d" onClick={() => del.mutate(r.id)} />,
            ];
          })}
      />
    </div>
  );
}

/* ---------- Item costs (versioned) ---------- */
function ItemCostsForm() {
  const [item, setItem] = useState("");
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [cost, setCost] = useState("");
  const [from, setFrom] = useState(new Date().toISOString().slice(0, 10));
  const invalidate = useInvalidateAll();

  const [q, setQ] = useState("");
  const { data: rows = [] } = useQuery({
    queryKey: ["entry_costs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("item_costs").select("*").order("effective_from", { ascending: false }).limit(1000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const name = item.trim();
      if (!name) throw new Error("Item name is required");
      const { error } = await supabase.from("item_costs").insert({
        item_name: name, cost_exvat: Number(cost), effective_from: from,
      });
      if (error) throw error;
      await logImport({ platform: "—", report_type: "invoice", file_name: `cost: ${name}` });
    },
    onSuccess: () => { toast.success("Cost version added"); setCost(""); invalidate(); },
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

  // Determine which row is the "current" version per item (latest effective_from
  // that is on or before today). Everything else for that item is "superseded".
  const today = new Date().toISOString().slice(0, 10);
  const currentIds = useMemo(() => {
    const byItem = new Map<string, { id: string; date: string }>();
    for (const r of rows) {
      if (r.effective_from > today) continue;
      const cur = byItem.get(r.item_name);
      if (!cur || r.effective_from > cur.date) byItem.set(r.item_name, { id: r.id, date: r.effective_from });
    }
    return new Set(Array.from(byItem.values()).map((v) => v.id));
  }, [rows, today]);

  const itemNames = useMemo(() => {
    return Array.from(new Set(rows.map((r) => r.item_name))).sort((a, b) => a.localeCompare(b));
  }, [rows]);

  return (
    <div className="space-y-6 mt-4">
      <Card className="p-5">
        <p className="text-xs text-muted-foreground mb-3">Each save adds a new version. The dashboard uses the latest version on or before the requested month.</p>
        <form className="grid gap-4 md:grid-cols-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <Field label="Item name">
            {mode === "existing" ? (
              <Select
                value={item}
                onValueChange={(v) => {
                  if (v === "__new__") { setMode("new"); setItem(""); }
                  else setItem(v);
                }}
              >
                <SelectTrigger><SelectValue placeholder="Select item" /></SelectTrigger>
                <SelectContent>
                  {itemNames.map((n) => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                  <SelectItem value="__new__" className="text-primary">+ Add new item</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <div className="flex gap-2">
                <Input value={item} onChange={(e) => setItem(e.target.value)} required placeholder="New item name" autoFocus />
                <Button type="button" variant="ghost" size="sm" onClick={() => { setMode("existing"); setItem(""); }}>Cancel</Button>
              </div>
            )}
          </Field>
          <Field label="Cost (ex-VAT, JOD)"><Input type="number" step="0.0001" min="0" value={cost} onChange={(e) => setCost(e.target.value)} required /></Field>
          <Field label="Effective from"><DatePicker value={from} onChange={setFrom} /></Field>
          <SubmitBtn pending={save.isPending} />
        </form>
      </Card>
      <RecentTable
        title="Cost history"
        right={
          <Input
            placeholder="Search items…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-8 w-48 text-xs"
          />
        }
        headers={["Item", "Cost (ex-VAT)", "Effective from", "Status", ""]}
        rows={rows
          .filter((r) => !q || r.item_name.toLowerCase().includes(q.toLowerCase()))
          .map((r) => {
          const isCurrent = currentIds.has(r.id);
          const isFuture = r.effective_from > today;
          return [
            r.item_name,
            fmtJOD(Number(r.cost_exvat)),
            r.effective_from,
            isFuture ? (
              <Badge key="s" variant="outline" className="bg-primary/10 text-primary border-primary/30">scheduled</Badge>
            ) : isCurrent ? (
              <Badge key="s" variant="outline" className="bg-success/15 text-success border-success/30">current</Badge>
            ) : (
              <Badge key="s" variant="outline" className="text-muted-foreground">superseded</Badge>
            ),
            <DeleteBtn key="d" onClick={() => del.mutate(r.id)} />,
          ];
        })}
      />
    </div>
  );
}

/* ---------- Targets ---------- */
function TargetsForm() {
  const [month, setMonth] = useState(currentMonth());
  const [platform, setPlatform] = useState<Platform>("Talabat");
  const [salesT, setSalesT] = useState("");
  const invalidate = useInvalidateAll();

  const filter = useListFilter();
  const { data: rows = [] } = useQuery({
    queryKey: ["entry_targets"],
    queryFn: async () => {
      const { data, error } = await supabase.from("targets").select("*").order("month", { ascending: false }).limit(1000);
      if (error) throw error;
      return data ?? [];
    },
  });
  const months = useMemo(
    () => Array.from(new Set(rows.map((r) => r.month))).sort().reverse(),
    [rows],
  );
  const filtered = applyListFilter(rows, filter, (r) => r.month);

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("targets").upsert(
        { month, platform, sales_target_jod: Number(salesT) },
        { onConflict: "month,platform" },
      );
      if (error) throw error;
      await logImport({ platform, report_type: "invoice", file_name: `target: ${month}` });
    },
    onSuccess: () => { toast.success("Saved"); setSalesT(""); invalidate(); },
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
        <form className="grid gap-4 md:grid-cols-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <Field label="Month"><MonthPicker value={month} onChange={setMonth} /></Field>
          <Field label="Platform"><PlatformSelect value={platform} onChange={setPlatform} /></Field>
          <Field label="Sales target (JOD)"><Input type="number" step="0.001" min="0" value={salesT} onChange={(e) => setSalesT(e.target.value)} required /></Field>
          <SubmitBtn pending={save.isPending} />
        </form>
      </Card>
      <RecentTable
        title="Targets"
        right={<ListFilterBar f={filter} months={months} />}
        headers={["Month", "Platform", "Sales target", ""]}
        rows={filtered.map((r) => [
          r.month,
          <Badge key="p" variant="outline" className={platformBg(r.platform as Platform)}>{r.platform}</Badge>,
          fmtJOD(Number(r.sales_target_jod)),
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
/** Client-side list filter (platform + month) for the "browse" tables below each form. */
type ListFilter = {
  platform: PlatformKey;
  setPlatform: (v: PlatformKey) => void;
  month: string;
  setMonth: (v: string) => void;
};
function useListFilter(): ListFilter {
  const [platform, setPlatform] = useState<PlatformKey>("All");
  const [month, setMonth] = useState("all");
  return { platform, setPlatform, month, setMonth };
}
function applyListFilter<T extends { platform?: string }>(
  rows: T[],
  f: ListFilter,
  monthOf: (r: T) => string,
): T[] {
  return rows.filter(
    (r) =>
      (f.platform === "All" || r.platform === f.platform) &&
      (f.month === "all" || monthOf(r) === f.month),
  );
}
function ListFilterBar({ f, months }: { f: ListFilter; months: string[] }) {
  return (
    <div className="flex items-center gap-2">
      <Select value={f.platform} onValueChange={(v) => f.setPlatform(v as PlatformKey)}>
        <SelectTrigger className="h-8 w-36 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="All">All platforms</SelectItem>
          {PLATFORMS.map((p) => (
            <SelectItem key={p} value={p}>
              {p}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={f.month} onValueChange={f.setMonth}>
        <SelectTrigger className="h-8 w-32 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All months</SelectItem>
          {months.map((m) => (
            <SelectItem key={m} value={m}>
              {m}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function RecentTable({
  title,
  headers,
  rows,
  right,
}: {
  title: string;
  headers: string[];
  rows: React.ReactNode[][];
  right?: React.ReactNode;
}) {
  return (
    <Card className="p-0 overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center justify-between gap-3 flex-wrap">
        <span className="text-sm font-semibold">{title}</span>
        {right}
      </div>
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

/* ---------- Clear month ---------- */
const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function fmtMonth(m: string) {
  const [y, mo] = m.split("-");
  return `${MONTH_NAMES[Number(mo) - 1]} ${y}`;
}

function ClearMonthForm() {
  const [month, setMonth] = useState(currentMonth());
  const [platform, setPlatform] = useState<Platform | "All">("All");
  const [phase, setPhase] = useState<"idle" | "confirm">("idle");
  const invalidate = useInvalidateAll();

  const label = `${fmtMonth(month)}${platform === "All" ? "" : ` · ${platform}`}`;

  const clearMut = useMutation({
    mutationFn: async () => {
      const [y, mo] = month.split("-").map(Number);
      const start = `${month}-01`;
      const next = mo === 12
        ? `${y + 1}-01-01`
        : `${y}-${String(mo + 1).padStart(2, "0")}-01`;

      const tables: Array<{ table: string; dateCol: string; dateIsMonth: boolean }> = [
        { table: "daily_sales",        dateCol: "date",       dateIsMonth: false },
        { table: "platform_orders",    dateCol: "date",       dateIsMonth: false },
        { table: "monthly_item_sales", dateCol: "month",      dateIsMonth: true  },
        { table: "monthly_financials", dateCol: "month",      dateIsMonth: true  },
        { table: "monthly_adjustments",dateCol: "month",      dateIsMonth: true  },
        { table: "monthly_customers",  dateCol: "month",      dateIsMonth: true  },
      ];

      for (const { table, dateCol, dateIsMonth } of tables) {
        let q = supabase.from(table as any).delete();
        if (dateIsMonth) {
          q = (q as any).eq(dateCol, month);
        } else {
          q = (q as any).gte(dateCol, start).lt(dateCol, next);
        }
        if (platform !== "All") q = (q as any).eq("platform", platform);
        const { error } = await q;
        if (error) throw new Error(`${table}: ${error.message}`);
      }
    },
    onSuccess: () => {
      toast.success(`Cleared ${label}`);
      setPhase("idle");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card className="p-6 mt-4 max-w-lg">
      <div className="flex items-start gap-3 mb-5 rounded-md border border-destructive/40 bg-destructive/10 px-4 py-3">
        <AlertTriangle className="size-5 text-destructive shrink-0 mt-0.5" />
        <p className="text-sm text-destructive">
          Deletes <strong>all imported rows</strong> for the chosen month and platform from
          daily_sales, platform_orders, monthly_item_sales, monthly_financials, monthly_adjustments,
          and monthly_customers.
          This cannot be undone — the data must be re-imported.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label className="text-xs">Month</Label>
          <MonthPicker value={month} onChange={(v) => { setMonth(v); setPhase("idle"); }} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Platform</Label>
          <Select value={platform} onValueChange={(v) => { setPlatform(v as typeof platform); setPhase("idle"); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All platforms</SelectItem>
              {PLATFORMS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {phase === "idle" && (
          <Button variant="destructive" className="w-full" onClick={() => setPhase("confirm")}>
            <Trash2 className="size-4 mr-2" />
            Clear {label}…
          </Button>
        )}

        {phase === "confirm" && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 space-y-3">
            <p className="text-sm font-medium text-destructive">
              Are you sure? This will permanently delete all data for <strong>{label}</strong>.
            </p>
            <div className="flex gap-2">
              <Button
                variant="destructive"
                className="flex-1"
                disabled={clearMut.isPending}
                onClick={() => clearMut.mutate()}
              >
                {clearMut.isPending ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Trash2 className="size-4 mr-2" />}
                Yes, clear {label}
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setPhase("idle")}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}