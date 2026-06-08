import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/fyxx/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Loader2, Upload, CheckCircle2, AlertCircle } from "lucide-react";
import { PLATFORMS, currentMonth, platformBg, fmtJOD, fmtInt, type Platform } from "@/lib/fyxx";
import {
  REPORTS, autoMap, loadMapping, saveMapping, parseCsv, parseDate, dateToMonth, num,
  type Mapping, type ReportType,
} from "@/lib/csv-import";

export const Route = createFileRoute("/_authenticated/import")({
  head: () => ({ meta: [{ title: "CSV import · Fyxx" }] }),
  component: ImportPage,
});

type RowOp = { key: string; payload: Record<string, unknown>; exists: boolean };
type Preview = {
  rows: RowOp[];
  willAdd: number;
  willUpdate: number;
  skipped: number;
  notes: string[];
  previewCols: string[];
  previewRows: Array<Record<string, string | number>>;
};

function ImportPage() {
  const qc = useQueryClient();
  const [platform, setPlatform] = useState<Platform>("Talabat");
  const [reportType, setReportType] = useState<ReportType>("performance");
  const [month, setMonth] = useState(currentMonth());
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Mapping>({});
  const [preview, setPreview] = useState<Preview | null>(null);
  const [building, setBuilding] = useState(false);

  const report = REPORTS[reportType];

  // Reset state when picker changes
  useEffect(() => {
    setFile(null); setHeaders([]); setRawRows([]); setMapping({}); setPreview(null);
  }, [platform, reportType]);

  async function onFile(f: File | null) {
    setFile(f); setHeaders([]); setRawRows([]); setMapping({}); setPreview(null);
    if (!f) return;
    const text = await f.text();
    const { headers, rows } = parseCsv(text);
    setHeaders(headers); setRawRows(rows);
    const saved = loadMapping(platform, reportType);
    const auto = autoMap(headers, reportType);
    const merged: Mapping = { ...auto, ...(saved ?? {}) };
    // Drop mappings to headers that aren't in this file
    for (const k of Object.keys(merged)) {
      if (!headers.includes(merged[k])) delete merged[k];
    }
    setMapping(merged);
  }

  const missingFields = report.fields.filter((f) => f.required && !mapping[f.key]);
  const canPreview = file && headers.length > 0 && missingFields.length === 0
    && (!report.needsMonth || /^\d{4}-\d{2}$/.test(month));

  async function buildPreview() {
    if (!canPreview) return;
    setBuilding(true); setPreview(null);
    try {
      saveMapping(platform, reportType, mapping);
      const built = await buildPreviewForReport(reportType, platform, month, mapping, rawRows);
      setPreview(built);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBuilding(false);
    }
  }

  const importMut = useMutation({
    mutationFn: async () => {
      if (!preview) return;
      const payloads = preview.rows.map((r) => r.payload);
      const t = report.table;
      const onConflict =
        t === "daily_sales" ? "date,platform" :
        t === "monthly_item_sales" ? "month,platform,item_name" :
        "month,platform";
      // Chunked upsert
      for (let i = 0; i < payloads.length; i += 500) {
        const chunk = payloads.slice(i, i + 500);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase.from(t) as any).upsert(chunk, { onConflict });
        if (error) throw error;
      }
      await supabase.from("import_log").insert({
        platform, report_type: reportType,
        file_name: file?.name ?? "csv",
        rows_imported: payloads.length, status: "success",
      });
    },
    onSuccess: () => {
      toast.success(`Imported ${preview?.rows.length ?? 0} rows`);
      setFile(null); setHeaders([]); setRawRows([]); setPreview(null);
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <PageHeader
        title="CSV import"
        description="Upload Talabat reports as-exported. Mappings save per platform + report type — one-click next time."
      />

      <Card className="p-5 space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Platform">
            <Select value={platform} onValueChange={(v) => setPlatform(v as Platform)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PLATFORMS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Report type">
            <Select value={reportType} onValueChange={(v) => setReportType(v as ReportType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.values(REPORTS).map((r) => <SelectItem key={r.type} value={r.type}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          {report.needsMonth && (
            <Field label="Month this export covers">
              <Input value={month} onChange={(e) => setMonth(e.target.value)} pattern="\d{4}-\d{2}" placeholder="YYYY-MM" />
            </Field>
          )}
        </div>

        <div>
          <Label className="text-xs">CSV file</Label>
          <div className="mt-1.5 flex items-center gap-3">
            <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-card hover:bg-accent text-sm">
              <Upload className="size-4" />
              {file ? "Replace file" : "Choose CSV"}
              <input type="file" accept=".csv,text/csv" className="hidden"
                onChange={(e) => onFile(e.target.files?.[0] ?? null)} />
            </label>
            {file && <span className="text-sm text-muted-foreground">{file.name} · {rawRows.length} rows</span>}
          </div>
        </div>
      </Card>

      {headers.length > 0 && (
        <Card className="p-5 mt-4">
          <div className="text-sm font-semibold mb-3">Column mapping</div>
          <p className="text-xs text-muted-foreground mb-4">
            Auto-matched from headers. Saved per platform + report type so next upload is one click.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {report.fields.map((f) => (
              <Field key={f.key} label={f.label + (f.required ? " *" : "")}>
                <Select
                  value={mapping[f.key] ?? "__none__"}
                  onValueChange={(v) =>
                    setMapping((m) => {
                      const next = { ...m };
                      if (v === "__none__") delete next[f.key];
                      else next[f.key] = v;
                      return next;
                    })
                  }
                >
                  <SelectTrigger><SelectValue placeholder="— pick column —" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— none —</SelectItem>
                    {headers.map((h) => <SelectItem key={h} value={h}>{h}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={buildPreview} disabled={!canPreview || building} className="bg-gradient-primary text-primary-foreground">
              {building && <Loader2 className="size-4 animate-spin mr-2" />}
              Build preview
            </Button>
            {missingFields.length > 0 && (
              <div className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="size-3.5" /> Missing: {missingFields.map((f) => f.label).join(", ")}
              </div>
            )}
          </div>
        </Card>
      )}

      {preview && (
        <Card className="p-5 mt-4 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="text-sm font-semibold flex items-center gap-2">
              <CheckCircle2 className="size-4 text-success" /> Preview
            </div>
            <div className="flex gap-2 text-xs">
              <Badge variant="outline" className="bg-success/15 text-success border-success/30">Will add {preview.willAdd}</Badge>
              <Badge variant="outline" className="bg-primary/15 text-primary border-primary/30">Will update {preview.willUpdate}</Badge>
              {preview.skipped > 0 && <Badge variant="outline" className="text-muted-foreground">Skipped {preview.skipped}</Badge>}
            </div>
          </div>
          {preview.notes.length > 0 && (
            <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-5">
              {preview.notes.map((n, i) => <li key={i}>{n}</li>)}
            </ul>
          )}

          <div className="overflow-x-auto border border-border rounded-md max-h-96">
            <Table>
              <TableHeader>
                <TableRow>
                  {preview.previewCols.map((c) => <TableHead key={c}>{c}</TableHead>)}
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.previewRows.map((r, i) => (
                  <TableRow key={i}>
                    {preview.previewCols.map((c) => (
                      <TableCell key={c} className="text-num">{r[c] as React.ReactNode}</TableCell>
                    ))}
                    <TableCell>
                      {preview.rows[i].exists
                        ? <Badge variant="outline" className="bg-primary/15 text-primary border-primary/30">update</Badge>
                        : <Badge variant="outline" className="bg-success/15 text-success border-success/30">add</Badge>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex gap-2">
            <Button onClick={() => importMut.mutate()} disabled={importMut.isPending || preview.rows.length === 0}
              className="bg-gradient-primary text-primary-foreground">
              {importMut.isPending && <Loader2 className="size-4 animate-spin mr-2" />}
              Confirm import ({preview.rows.length} rows)
            </Button>
            <Button variant="ghost" onClick={() => setPreview(null)}>Cancel</Button>
          </div>
        </Card>
      )}
    </div>
  );
}

/* -------- preview builders -------- */

async function buildPreviewForReport(
  type: ReportType, platform: Platform, month: string, mapping: Mapping, rows: Record<string, string>[],
): Promise<Preview> {
  if (type === "performance") return buildPerformance(platform, mapping, rows);
  if (type === "popular_dishes") return buildPopularDishes(platform, month, mapping, rows);
  return buildInvoice(platform, mapping, rows);
}

async function buildPerformance(platform: Platform, m: Mapping, rows: Record<string, string>[]): Promise<Preview> {
  const grouped = new Map<string, { date: string; sales: number; orders: number }>();
  let skipped = 0;
  for (const r of rows) {
    const date = parseDate(r[m.date]);
    if (!date) { skipped++; continue; }
    // Blank sales/orders → 0 (no-order days)
    grouped.set(date, { date, sales: num(r[m.sales_jod]), orders: num(r[m.orders]) });
  }
  const dates = Array.from(grouped.keys());
  const { data: existing } = await supabase
    .from("daily_sales").select("date").eq("platform", platform).in("date", dates);
  const existingSet = new Set((existing ?? []).map((r) => r.date));

  const ops: RowOp[] = [];
  const previewRows: Array<Record<string, string | number>> = [];
  let willAdd = 0, willUpdate = 0;
  for (const g of Array.from(grouped.values()).sort((a, b) => a.date.localeCompare(b.date))) {
    const exists = existingSet.has(g.date);
    if (exists) willUpdate++; else willAdd++;
    ops.push({
      key: `${g.date}|${platform}`,
      exists,
      payload: { date: g.date, platform, sales_jod: g.sales, orders: Math.round(g.orders) },
    });
    previewRows.push({ Date: g.date, Sales: fmtJOD(g.sales), Orders: fmtInt(g.orders) });
  }
  const blankRows = Array.from(grouped.values()).filter((g) => g.sales === 0 && g.orders === 0).length;
  const notes = [
    `Platform set to ${platform} automatically.`,
    blankRows > 0 ? `${blankRows} no-order day(s) will be imported as 0 sales / 0 orders.` : "",
    skipped > 0 ? `${skipped} row(s) skipped (no valid date).` : "",
  ].filter(Boolean);
  return { rows: ops, willAdd, willUpdate, skipped, notes,
    previewCols: ["Date", "Sales", "Orders"], previewRows };
}

async function buildPopularDishes(platform: Platform, month: string, m: Mapping, rows: Record<string, string>[]): Promise<Preview> {
  const grouped = new Map<string, number>();
  let skipped = 0;
  for (const r of rows) {
    const name = (r[m.item_name] ?? "").trim();
    if (!name) { skipped++; continue; }
    const u = num(r[m.units]);
    grouped.set(name, (grouped.get(name) ?? 0) + u);
  }
  const items = Array.from(grouped.keys());
  const { data: existing } = await supabase
    .from("monthly_item_sales").select("item_name")
    .eq("platform", platform).eq("month", month).in("item_name", items);
  const existingSet = new Set((existing ?? []).map((r) => r.item_name));

  const ops: RowOp[] = [];
  const previewRows: Array<Record<string, string | number>> = [];
  let willAdd = 0, willUpdate = 0;
  for (const [name, units] of Array.from(grouped.entries()).sort((a, b) => b[1] - a[1])) {
    const exists = existingSet.has(name);
    if (exists) willUpdate++; else willAdd++;
    ops.push({
      key: `${month}|${platform}|${name}`, exists,
      payload: { month, platform, item_name: name, units: Math.round(units) },
    });
    previewRows.push({ Item: name, Units: fmtInt(units) });
  }
  const notes = [
    `All ${items.length} dish(es) will be tagged with month ${month} on ${platform}.`,
    skipped > 0 ? `${skipped} row(s) skipped (blank dish name).` : "",
  ].filter(Boolean);
  return { rows: ops, willAdd, willUpdate, skipped, notes,
    previewCols: ["Item", "Units"], previewRows };
}

async function buildInvoice(platform: Platform, m: Mapping, rows: Record<string, string>[]): Promise<Preview> {
  type Agg = { month: string; gross: number; payout: number; orders: number; commission: number; periods: number };
  const grouped = new Map<string, Agg>();
  let skipped = 0;
  for (const r of rows) {
    const end = parseDate(r[m.end_date]);
    if (!end) { skipped++; continue; }
    const mo = dateToMonth(end);
    const cur = grouped.get(mo) ?? { month: mo, gross: 0, payout: 0, orders: 0, commission: 0, periods: 0 };
    cur.gross += num(r[m.gross_sales]);
    cur.payout += num(r[m.actual_payout]);
    cur.orders += num(r[m.orders]);
    cur.commission += Math.abs(num(r[m.commission]));
    cur.periods += 1;
    grouped.set(mo, cur);
  }
  const months = Array.from(grouped.keys());
  const { data: existing } = await supabase
    .from("monthly_financials").select("month").eq("platform", platform).in("month", months);
  const existingSet = new Set((existing ?? []).map((r) => r.month));

  const ops: RowOp[] = [];
  const previewRows: Array<Record<string, string | number>> = [];
  let willAdd = 0, willUpdate = 0;
  for (const a of Array.from(grouped.values()).sort((x, y) => x.month.localeCompare(y.month))) {
    const exists = existingSet.has(a.month);
    if (exists) willUpdate++; else willAdd++;
    ops.push({
      key: `${a.month}|${platform}`, exists,
      payload: {
        month: a.month, platform,
        gross_sales: a.gross, actual_payout: a.payout,
        orders: Math.round(a.orders), commission: a.commission,
      },
    });
    previewRows.push({
      Month: a.month, Gross: fmtJOD(a.gross), Payout: fmtJOD(a.payout),
      Orders: fmtInt(a.orders), Commission: fmtJOD(a.commission),
    });
  }
  const notes = [
    "Rows grouped by the month of each invoice's End date.",
    "Commission stored as a positive number (absolute value).",
    "COGS is preserved — invoice imports do not overwrite it.",
    skipped > 0 ? `${skipped} row(s) skipped (no End date).` : "",
  ].filter(Boolean);
  return { rows: ops, willAdd, willUpdate, skipped, notes,
    previewCols: ["Month", "Gross", "Payout", "Orders", "Commission"], previewRows };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}