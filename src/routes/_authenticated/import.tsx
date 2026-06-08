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
import { Loader2, Upload, CheckCircle2, AlertCircle, ExternalLink } from "lucide-react";
import { PLATFORMS, currentMonth, fmtJOD, fmtInt, type Platform } from "@/lib/fyxx";
import { DatePicker, MonthPicker } from "@/components/fyxx/date-picker";
import {
  REPORTS, reportsForPlatform, autoMap, loadMapping, saveMapping, parseCsv,
  parseDate, dateToMonth, monthFromColumns, num,
  type Mapping, type ReportDef, type ReportId,
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
  table: ReportDef["table"];
  onConflict: string;
};

function ImportPage() {
  const qc = useQueryClient();
  const [platform, setPlatform] = useState<Platform>("Talabat");
  const reports = useMemo(() => reportsForPlatform(platform), [platform]);
  const [reportId, setReportId] = useState<ReportId>(reports[0].id);

  // Keep reportId in-sync when platform changes
  useEffect(() => {
    if (!reports.find((r) => r.id === reportId)) setReportId(reports[0].id);
  }, [reports, reportId]);

  const report = REPORTS[reportId];

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <PageHeader
        title="CSV import"
        description="Pick a platform and a report. Mappings save per report — one-click next time."
      />

      <Card className="p-5 space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Platform">
            <Select value={platform} onValueChange={(v) => setPlatform(v as Platform)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{PLATFORMS.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Report type">
            <Select value={reportId} onValueChange={(v) => setReportId(v as ReportId)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {reports.map((r) => <SelectItem key={r.id} value={r.id}>{r.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <div className="flex items-start justify-between gap-3 rounded-md border border-border bg-muted/30 p-3">
          <div className="text-xs text-muted-foreground">{report.hint}</div>
          <a href={report.portalUrl} target="_blank" rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-primary hover:underline">
            {report.portalLabel} <ExternalLink className="size-3.5" />
          </a>
        </div>
      </Card>

      {report.kind === "csv" ? (
        <CsvFlow key={reportId} report={report} platform={platform} qc={qc} />
      ) : (
        <CareemInvoiceFlow key={reportId} report={report} platform={platform} qc={qc} />
      )}
    </div>
  );
}

/* =========================================================================
   CSV upload flow
   ========================================================================= */

function CsvFlow({ report, platform, qc }: {
  report: ReportDef; platform: Platform;
  qc: ReturnType<typeof useQueryClient>;
}) {
  const [month, setMonth] = useState(currentMonth());
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Mapping>({});
  const [preview, setPreview] = useState<Preview | null>(null);
  const [building, setBuilding] = useState(false);

  async function onFile(f: File | null) {
    setFile(f); setHeaders([]); setRawRows([]); setMapping({}); setPreview(null);
    if (!f) return;
    const text = await f.text();
    const { headers, rows } = parseCsv(text);
    setHeaders(headers); setRawRows(rows);
    const saved = loadMapping(report.id);
    const auto = autoMap(headers, report.id);
    const merged: Mapping = { ...auto, ...(saved ?? {}) };
    for (const k of Object.keys(merged)) {
      if (!headers.includes(merged[k])) delete merged[k];
    }
    setMapping(merged);
  }

  const missingFields = report.fields.filter((f) => f.required && !mapping[f.key]);
  const canPreview = !!file && headers.length > 0 && missingFields.length === 0
    && (report.monthSource !== "ask" || /^\d{4}-\d{2}$/.test(month));

  async function buildPreview() {
    if (!canPreview) return;
    setBuilding(true); setPreview(null);
    try {
      saveMapping(report.id, mapping);
      let chosenMonth = month;
      if (report.monthSource === "from-columns" && report.monthColumns) {
        const m = monthFromColumns(rawRows, report.monthColumns);
        if (!m) throw new Error(`Could not read ${report.monthColumns.from}/${report.monthColumns.to} from file.`);
        chosenMonth = m;
      }
      const built = await buildPreviewForReport(report, platform, chosenMonth, mapping, rawRows);
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
      for (let i = 0; i < payloads.length; i += 500) {
        const chunk = payloads.slice(i, i + 500);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase.from(preview.table) as any)
          .upsert(chunk, { onConflict: preview.onConflict });
        if (error) throw error;
      }
      await supabase.from("import_log").insert({
        platform, report_type: report.id,
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

  const allFields = [...report.fields, ...(report.optionalFields ?? [])];

  return (
    <>
      <Card className="p-5 mt-4 space-y-4">
        {report.monthSource === "ask" && (
          <Field label="Month this export covers">
            <div className="max-w-xs"><MonthPicker value={month} onChange={setMonth} /></div>
          </Field>
        )}
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
            Auto-matched from headers. Saved per report so next upload is one click.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {allFields.map((f) => (
              <Field key={f.key} label={f.label + (f.required ? " *" : " (optional)")}>
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
    </>
  );
}

/* =========================================================================
   Careem invoice — manual entry (PDF source)
   ========================================================================= */

function CareemInvoiceFlow({ report, platform, qc }: {
  report: ReportDef; platform: Platform;
  qc: ReturnType<typeof useQueryClient>;
}) {
  const [month, setMonth] = useState(currentMonth());
  const [gross, setGross] = useState("");
  const [platformFee, setPlatformFee] = useState("");
  const [cplusFee, setCplusFee] = useState("");
  const [pgFee, setPgFee] = useState("");
  const [bankFee, setBankFee] = useState("");
  const [orders, setOrders] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [building, setBuilding] = useState(false);

  const VAT = 0.16;
  const grossN = num(gross);
  const feeRows = [
    { key: "pg",       label: "Payment gateway fee", value: pgFee,       set: setPgFee },
    { key: "platform", label: "Platform fee",        value: platformFee, set: setPlatformFee },
    { key: "cplus",    label: "CPlus fee",           value: cplusFee,    set: setCplusFee },
    { key: "bank",     label: "Bank transfer fee",   value: bankFee,     set: setBankFee },
  ];
  const netTotals = feeRows.map((r) => num(r.value));
  const totalNet = netTotals.reduce((s, n) => s + n, 0);
  const totalVat = totalNet * VAT;
  const grandTotal = totalNet + totalVat;
  const payout = grossN - grandTotal;

  const canPreview = /^\d{4}-\d{2}$/.test(month) && grossN > 0;

  async function buildPreview() {
    if (!canPreview) return;
    setBuilding(true);
    try {
      const { data: existing } = await supabase
        .from("monthly_financials").select("month").eq("platform", platform).eq("month", month);
      const exists = (existing ?? []).length > 0;
      const payload = {
        month, platform,
        gross_sales: grossN,
        actual_payout: payout,
        // Store net (excl-VAT) fees — margins use VAT-stripped values.
        commission: totalNet,
        orders: Math.round(num(orders)),
      };
      setPreview({
        rows: [{ key: `${month}|${platform}`, exists, payload }],
        willAdd: exists ? 0 : 1, willUpdate: exists ? 1 : 0, skipped: 0,
        notes: [
          `Stored commission = sum of Net Prices (excl. VAT) = ${fmtJOD(totalNet)}.`,
          `Payout = Gross incl. VAT (${fmtJOD(grossN)}) − Grand Total incl. VAT (${fmtJOD(grandTotal)}) = ${fmtJOD(payout)}.`,
          "COGS is preserved — manual invoice entry does not overwrite it.",
        ],
        previewCols: ["Month", "Gross (incl VAT)", "Fees (net)", "Fees (incl VAT)", "Payout", "Orders"],
        previewRows: [{
          Month: month,
          "Gross (incl VAT)": fmtJOD(grossN),
          "Fees (net)": fmtJOD(totalNet),
          "Fees (incl VAT)": fmtJOD(grandTotal),
          Payout: fmtJOD(payout), Orders: fmtInt(num(orders)),
        }],
        table: "monthly_financials",
        onConflict: "month,platform",
      });
    } finally {
      setBuilding(false);
    }
  }

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!preview) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from("monthly_financials") as any)
        .upsert(preview.rows[0].payload, { onConflict: "month,platform" });
      if (error) throw error;
      await supabase.from("import_log").insert({
        platform, report_type: report.id,
        file_name: `careem invoice ${month}`, rows_imported: 1, status: "success",
      });
    },
    onSuccess: () => {
      toast.success(`Saved Careem invoice for ${month}`);
      setPreview(null); setGross(""); setPlatformFee(""); setCplusFee("");
      setPgFee(""); setBankFee(""); setOrders("");
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <Card className="p-5 mt-4 space-y-4">
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Invoice month">
            <MonthPicker value={month} onChange={setMonth} />
          </Field>
          <Field label="Total Gross Amount (incl. VAT)">
            <Input value={gross} onChange={(e) => setGross(e.target.value)} inputMode="decimal" placeholder="0.00" />
          </Field>
          <Field label="Orders count (optional)">
            <Input value={orders} onChange={(e) => setOrders(e.target.value)} inputMode="numeric" placeholder="0" />
          </Field>
        </div>

        <div className="space-y-2">
          <div>
            <Label className="text-sm font-semibold">Fees</Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              Enter the Net Price (excl. VAT) for each fee — from the invoice's "Net Price" column. VAT (16%) and Total (incl. VAT) are calculated for confirmation.
            </p>
          </div>
          <div className="rounded-md border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fee</TableHead>
                  <TableHead className="text-right">Net Price (excl. VAT)</TableHead>
                  <TableHead className="text-right">VAT 16%</TableHead>
                  <TableHead className="text-right">Total (incl. VAT)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {feeRows.map((r, i) => {
                  const net = netTotals[i];
                  const vat = net * VAT;
                  return (
                    <TableRow key={r.key}>
                      <TableCell className="font-medium">{r.label}</TableCell>
                      <TableCell className="text-right">
                        <Input
                          value={r.value}
                          onChange={(e) => r.set(e.target.value)}
                          inputMode="decimal"
                          placeholder="0.00"
                          className="text-right ml-auto max-w-[140px]"
                        />
                      </TableCell>
                      <TableCell className="text-right text-num text-muted-foreground">{fmtJOD(vat)}</TableCell>
                      <TableCell className="text-right text-num">{fmtJOD(net + vat)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>

        <div className="rounded-md border border-border bg-muted/30 p-4 text-sm space-y-1.5">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total Fees (Excl. VAT)</span>
            <span className="text-num">{fmtJOD(totalNet)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Total VAT</span>
            <span className="text-num">{fmtJOD(totalVat)}</span>
          </div>
          <div className="flex justify-between pt-1.5 border-t border-border">
            <span className="font-semibold">Grand Total (Incl. VAT)</span>
            <span className="text-num font-semibold">{fmtJOD(grandTotal)}</span>
          </div>
          <div className="flex justify-between pt-1.5 text-xs">
            <span className="text-muted-foreground">Computed payout (Gross − Grand Total)</span>
            <span className="text-num font-medium">{fmtJOD(payout)}</span>
          </div>
        </div>

        <div>
          <Button onClick={buildPreview} disabled={!canPreview || building}
            className="bg-gradient-primary text-primary-foreground">
            {building && <Loader2 className="size-4 animate-spin mr-2" />}
            Build preview
          </Button>
        </div>
      </Card>

      {preview && (
        <Card className="p-5 mt-4 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="text-sm font-semibold flex items-center gap-2">
              <CheckCircle2 className="size-4 text-success" /> Preview
            </div>
            <div className="flex gap-2 text-xs">
              <Badge variant="outline" className="bg-success/15 text-success border-success/30">Will add {preview.willAdd}</Badge>
              <Badge variant="outline" className="bg-primary/15 text-primary border-primary/30">Will update {preview.willUpdate}</Badge>
            </div>
          </div>
          <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-5">
            {preview.notes.map((n, i) => <li key={i}>{n}</li>)}
          </ul>
          <div className="overflow-x-auto border border-border rounded-md">
            <Table>
              <TableHeader><TableRow>
                {preview.previewCols.map((c) => <TableHead key={c}>{c}</TableHead>)}
                <TableHead>Action</TableHead>
              </TableRow></TableHeader>
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
            <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}
              className="bg-gradient-primary text-primary-foreground">
              {saveMut.isPending && <Loader2 className="size-4 animate-spin mr-2" />}
              Confirm save
            </Button>
            <Button variant="ghost" onClick={() => setPreview(null)}>Cancel</Button>
          </div>
        </Card>
      )}
    </>
  );
}

/* =========================================================================
   Preview builders (CSV)
   ========================================================================= */

async function buildPreviewForReport(
  report: ReportDef, platform: Platform, month: string, mapping: Mapping, rows: Record<string, string>[],
): Promise<Preview> {
  switch (report.id) {
    case "talabat:performance":
    case "careem:daily_sales":
      return buildDaily(report, platform, mapping, rows);
    case "talabat:popular_dishes":
    case "careem:gross_breakdown":
      return buildItems(platform, month, mapping, rows);
    case "talabat:invoice":
      return buildTalabatInvoice(platform, mapping, rows);
    default:
      throw new Error(`No CSV builder for ${report.id}`);
  }
}

async function buildDaily(
  report: ReportDef, platform: Platform, m: Mapping, rows: Record<string, string>[],
): Promise<Preview> {
  const grouped = new Map<string, {
    date: string; sales: number; orders: number;
    cplus_sales: number; cplus_orders: number; cplus_aov: number;
  }>();
  let skipped = 0;
  for (const r of rows) {
    const date = parseDate(r[m.date]);
    if (!date) { skipped++; continue; }
    grouped.set(date, {
      date,
      sales: num(r[m.sales_jod]),
      orders: num(r[m.orders]),
      cplus_sales: m.cplus_sales_jod ? num(r[m.cplus_sales_jod]) : 0,
      cplus_orders: m.cplus_orders ? num(r[m.cplus_orders]) : 0,
      cplus_aov: m.cplus_aov ? num(r[m.cplus_aov]) : 0,
    });
  }
  const dates = Array.from(grouped.keys());
  const { data: existing } = await supabase
    .from("daily_sales").select("date").eq("platform", platform).in("date", dates);
  const existingSet = new Set((existing ?? []).map((r) => r.date));

  const ops: RowOp[] = [];
  const previewRows: Array<Record<string, string | number>> = [];
  let willAdd = 0, willUpdate = 0;
  const hasCplus = !!(m.cplus_sales_jod || m.cplus_orders || m.cplus_aov);
  for (const g of Array.from(grouped.values()).sort((a, b) => a.date.localeCompare(b.date))) {
    const exists = existingSet.has(g.date);
    if (exists) willUpdate++; else willAdd++;
    const payload: Record<string, unknown> = {
      date: g.date, platform,
      sales_jod: g.sales, orders: Math.round(g.orders),
    };
    if (hasCplus) {
      payload.cplus_sales_jod = g.cplus_sales;
      payload.cplus_orders = Math.round(g.cplus_orders);
      payload.cplus_aov = g.cplus_aov;
    }
    ops.push({ key: `${g.date}|${platform}`, exists, payload });
    const row: Record<string, string | number> = {
      Date: g.date, Sales: fmtJOD(g.sales), Orders: fmtInt(g.orders),
    };
    if (hasCplus) { row["C+ sales"] = fmtJOD(g.cplus_sales); row["C+ orders"] = fmtInt(g.cplus_orders); }
    previewRows.push(row);
  }
  const notes: string[] = [`Platform set to ${platform}.`];
  if (report.id === "careem:daily_sales") {
    notes.push("Careem only lists days with orders — any day not in this file stays at zero.");
    if (hasCplus) notes.push("Careem Plus tier columns will also be stored.");
  } else {
    const blank = Array.from(grouped.values()).filter((g) => g.sales === 0 && g.orders === 0).length;
    if (blank > 0) notes.push(`${blank} no-order day(s) will be imported as 0 sales / 0 orders.`);
  }
  if (skipped > 0) notes.push(`${skipped} row(s) skipped (no valid date).`);

  const cols = ["Date", "Sales", "Orders", ...(hasCplus ? ["C+ sales", "C+ orders"] : [])];
  return { rows: ops, willAdd, willUpdate, skipped, notes,
    previewCols: cols, previewRows, table: "daily_sales", onConflict: "date,platform" };
}

async function buildItems(
  platform: Platform, month: string, m: Mapping, rows: Record<string, string>[],
): Promise<Preview> {
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
    `All ${items.length} item(s) tagged with month ${month} on ${platform}.`,
    skipped > 0 ? `${skipped} row(s) skipped (blank name).` : "",
  ].filter(Boolean);
  return { rows: ops, willAdd, willUpdate, skipped, notes,
    previewCols: ["Item", "Units"], previewRows,
    table: "monthly_item_sales", onConflict: "month,platform,item_name" };
}

async function buildTalabatInvoice(
  platform: Platform, m: Mapping, rows: Record<string, string>[],
): Promise<Preview> {
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
    previewCols: ["Month", "Gross", "Payout", "Orders", "Commission"], previewRows,
    table: "monthly_financials", onConflict: "month,platform" };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs">{label}</Label>{children}</div>;
}