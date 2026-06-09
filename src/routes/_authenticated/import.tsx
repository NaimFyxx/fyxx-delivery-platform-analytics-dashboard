import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { Loader2, Upload, CheckCircle2, AlertCircle, ExternalLink, ChevronLeft, ChevronRight, Check, Circle } from "lucide-react";
import { PLATFORMS, currentMonth, fmtJOD, fmtInt, type Platform } from "@/lib/fyxx";
import { DatePicker, MonthPicker } from "@/components/fyxx/date-picker";
import {
  REPORTS, reportsForPlatform, autoMap, loadMapping, saveMapping, parseCsv,
  parseDate, dateToMonth, monthFromColumns, num,
  type Mapping, type ReportDef, type ReportId,
} from "@/lib/csv-import";
import { cn } from "@/lib/utils";

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
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [reportId, setReportId] = useState<ReportId | null>(null);
  const [checklistMonth, setChecklistMonth] = useState(currentMonth());

  const report = reportId ? REPORTS[reportId] : null;

  function restart() {
    setStep(1); setPlatform(null); setReportId(null);
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <PageHeader
        title="CSV import wizard"
        description="Four quick steps: pick a platform, pick a report, upload, then confirm."
      />

      <CompletenessPanel month={checklistMonth} onMonthChange={setChecklistMonth} />

      <Stepper
        step={step}
        platform={platform}
        reportLabel={report?.label ?? null}
        onJump={(s) => {
          // allow jumping backward to a completed step
          if (s < step) setStep(s as 1 | 2 | 3 | 4);
        }}
      />

      {step === 1 && (
        <Step1Platform
          value={platform}
          onPick={(p) => { setPlatform(p); setReportId(null); setStep(2); }}
        />
      )}

      {step === 2 && platform && (
        <Step2Report
          platform={platform}
          value={reportId}
          onBack={() => setStep(1)}
          onPick={(id) => { setReportId(id); setStep(3); }}
        />
      )}

      {step >= 3 && report && platform && (
        report.kind === "csv" ? (
          <CsvFlow
            key={report.id}
            report={report} platform={platform} qc={qc}
            step={step as 3 | 4}
            goNext={() => setStep(4)}
            goBack={() => setStep(step === 4 ? 3 : 2)}
            onDone={restart}
          />
        ) : (
          <CareemInvoiceFlow
            key={report.id}
            report={report} platform={platform} qc={qc}
            step={step as 3 | 4}
            goNext={() => setStep(4)}
            goBack={() => setStep(step === 4 ? 3 : 2)}
            onDone={restart}
          />
        )
      )}
    </div>
  );
}

/* ----- Wizard chrome ----- */

function Stepper({
  step, platform, reportLabel, onJump,
}: {
  step: 1 | 2 | 3 | 4;
  platform: Platform | null;
  reportLabel: string | null;
  onJump: (s: number) => void;
}) {
  const steps = [
    { n: 1, label: "Platform",         sub: platform ?? "—" },
    { n: 2, label: "Report",           sub: reportLabel ?? "—" },
    { n: 3, label: "Upload",           sub: step >= 3 ? "in progress" : "—" },
    { n: 4, label: "Preview & Confirm", sub: step === 4 ? "in progress" : "—" },
  ];
  return (
    <div className="mt-4 mb-6 grid grid-cols-2 md:grid-cols-4 gap-2">
      {steps.map((s) => {
        const active = s.n === step;
        const done = s.n < step;
        const clickable = s.n < step;
        return (
          <button
            key={s.n}
            type="button"
            disabled={!clickable}
            onClick={() => onJump(s.n)}
            className={cn(
              "text-left rounded-xl border px-3 py-2.5 transition-colors",
              active   && "border-primary bg-primary/10",
              done     && "border-success/40 bg-success/5 hover:bg-success/10 cursor-pointer",
              !active && !done && "border-border bg-card opacity-70",
            )}
          >
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide font-semibold">
              <span className={cn(
                "inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px]",
                done   ? "bg-success/30 text-success" :
                active ? "bg-primary text-primary-foreground" :
                         "bg-muted text-muted-foreground",
              )}>
                {done ? <Check className="size-3" /> : s.n}
              </span>
              <span className={cn(active && "text-primary", done && "text-success")}>
                Step {s.n} — {s.label}
              </span>
            </div>
            <div className="text-xs text-muted-foreground mt-1 truncate">{s.sub}</div>
          </button>
        );
      })}
    </div>
  );
}

function Step1Platform({
  value, onPick,
}: {
  value: Platform | null;
  onPick: (p: Platform) => void;
}) {
  return (
    <Card className="p-6">
      <div className="text-sm font-semibold mb-1">Step 1 — Which platform?</div>
      <p className="text-xs text-muted-foreground mb-4">Pick the delivery platform this report came from.</p>
      <div className="grid sm:grid-cols-2 gap-3">
        {PLATFORMS.map((p) => {
          const active = value === p;
          return (
            <button
              key={p}
              type="button"
              onClick={() => onPick(p)}
              className={cn(
                "rounded-xl border p-5 text-left transition-colors hover:border-primary",
                active ? "border-primary bg-primary/10" : "border-border bg-card",
              )}
            >
              <div className="font-display text-lg font-semibold">{p}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {p === "Talabat" ? "Talabat partner portal exports" : "Careem partner portal exports + manual invoice"}
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function Step2Report({
  platform, value, onBack, onPick,
}: {
  platform: Platform; value: ReportId | null;
  onBack: () => void; onPick: (id: ReportId) => void;
}) {
  const reports = reportsForPlatform(platform);
  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-1">
        <div className="text-sm font-semibold">Step 2 — Which report?</div>
        <Button variant="ghost" size="sm" onClick={onBack}><ChevronLeft className="size-3.5" /> Back</Button>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Each report writes to a different table. Pick the one you exported from {platform}.
      </p>
      <div className="grid sm:grid-cols-2 gap-3">
        {reports.map((r) => {
          const active = value === r.id;
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => onPick(r.id)}
              className={cn(
                "rounded-xl border p-4 text-left transition-colors hover:border-primary",
                active ? "border-primary bg-primary/10" : "border-border bg-card",
              )}
            >
              <div className="font-semibold text-sm">{r.label}</div>
              <div className="text-[11px] text-muted-foreground mt-1">{r.hint}</div>
              <div className="text-[10.5px] mt-2">
                <span className="text-muted-foreground">Writes to: </span>
                <span className="font-mono">{r.table}</span>
                <span className="text-muted-foreground"> · {r.kind === "manual" ? "manual form" : "CSV upload"}</span>
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

/* ----- Monthly completeness checklist (informational) ----- */

function CompletenessPanel({
  month, onMonthChange,
}: {
  month: string; onMonthChange: (m: string) => void;
}) {
  const { data } = useQuery({
    queryKey: ["import_completeness", month],
    queryFn: async () => {
      const start = `${month}-01`;
      const end   = `${month}-31`;
      const [daily, items, fin] = await Promise.all([
        supabase.from("daily_sales").select("platform,date").gte("date", start).lte("date", end),
        supabase.from("monthly_item_sales").select("platform").eq("month", month),
        supabase.from("monthly_financials").select("platform").eq("month", month),
      ]);
      const has = (rows: { platform: string }[] | null, p: Platform) =>
        !!rows?.some((r) => r.platform === p);
      return {
        Talabat: {
          daily: has(daily.data ?? [], "Talabat"),
          items: has(items.data ?? [], "Talabat"),
          invoice: has(fin.data ?? [], "Talabat"),
        },
        Careem: {
          daily: has(daily.data ?? [], "Careem"),
          items: has(items.data ?? [], "Careem"),
          invoice: has(fin.data ?? [], "Careem"),
        },
      };
    },
  });

  const rowsByPlatform: Record<Platform, { label: string; key: "daily" | "items" | "invoice" }[]> = {
    Talabat: [
      { label: "Daily sales (Performance)", key: "daily" },
      { label: "Popular Dishes (items)",    key: "items" },
      { label: "Invoice",                   key: "invoice" },
    ],
    Careem: [
      { label: "Daily sales",                       key: "daily" },
      { label: "Gross Sales Breakdown (items)",     key: "items" },
      { label: "Invoice (manual)",                  key: "invoice" },
    ],
  };

  return (
    <Card className="p-5 mb-4" style={{ background: "linear-gradient(135deg, #0b2222, #0f2c2c)" }}>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div>
          <div className="text-sm font-semibold">Monthly completeness</div>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Informational only — you can always import any report. Margin / COGS calculations need items + invoice for the month.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Label className="text-muted-foreground text-xs">Month</Label>
          <div className="w-44"><MonthPicker value={month} onChange={onMonthChange} /></div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        {PLATFORMS.map((p) => {
          const status = data?.[p];
          const incomplete = status && (!status.items || !status.invoice);
          return (
            <div key={p} className="rounded-xl border border-border bg-background/40 p-4">
              <div className="font-display font-semibold mb-2">{p}</div>
              <ul className="space-y-1.5">
                {rowsByPlatform[p].map((row) => {
                  const ok = status?.[row.key] ?? false;
                  return (
                    <li key={row.key} className="flex items-center gap-2 text-[12.5px]">
                      {ok
                        ? <Check className="size-4 text-success" />
                        : <Circle className="size-4 text-muted-foreground" />}
                      <span className={ok ? "" : "text-muted-foreground"}>{row.label}</span>
                    </li>
                  );
                })}
              </ul>
              {incomplete && (
                <div className="mt-2 text-[10.5px] text-muted-foreground italic">
                  Margin incomplete — items / invoice not yet imported for {month}.
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
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
  const grouped = new Map<string, { units: number; revenue: number }>();
  const hasRevenue = Boolean(m.revenue_jod);
  let skipped = 0;
  for (const r of rows) {
    const name = (r[m.item_name] ?? "").trim();
    if (!name) { skipped++; continue; }
    const u = num(r[m.units]);
    const rev = hasRevenue ? num(r[m.revenue_jod]) : 0;
    const cur = grouped.get(name) ?? { units: 0, revenue: 0 };
    cur.units += u;
    cur.revenue += rev;
    grouped.set(name, cur);
  }
  const items = Array.from(grouped.keys());
  const { data: existing } = await supabase
    .from("monthly_item_sales").select("item_name")
    .eq("platform", platform).eq("month", month).in("item_name", items);
  const existingSet = new Set((existing ?? []).map((r) => r.item_name));

  const ops: RowOp[] = [];
  const previewRows: Array<Record<string, string | number>> = [];
  let willAdd = 0, willUpdate = 0;
  const entries = Array.from(grouped.entries()).sort((a, b) =>
    hasRevenue ? b[1].revenue - a[1].revenue : b[1].units - a[1].units,
  );
  for (const [name, agg] of entries) {
    const exists = existingSet.has(name);
    if (exists) willUpdate++; else willAdd++;
    ops.push({
      key: `${month}|${platform}|${name}`, exists,
      payload: {
        month, platform, item_name: name,
        units: Math.round(agg.units),
        revenue_jod: Number(agg.revenue.toFixed(2)),
      },
    });
    previewRows.push(hasRevenue
      ? { Item: name, Units: fmtInt(agg.units), Revenue: `${fmtInt(agg.revenue)} JOD` }
      : { Item: name, Units: fmtInt(agg.units) });
  }
  const notes = [
    `All ${items.length} item(s) tagged with month ${month} on ${platform}.`,
    hasRevenue ? "Revenue (JOD) per item will be stored." : "No revenue column mapped — revenue will save as 0 (Insights ranks by units in that case).",
    skipped > 0 ? `${skipped} row(s) skipped (blank name).` : "",
  ].filter(Boolean);
  return { rows: ops, willAdd, willUpdate, skipped, notes,
    previewCols: hasRevenue ? ["Item", "Units", "Revenue"] : ["Item", "Units"], previewRows,
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