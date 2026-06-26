import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/fyxx/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import {
  Loader2,
  Upload,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Check,
  Circle,
} from "lucide-react";
import { PLATFORMS, currentMonth, fmtJOD, fmtInt, type Platform } from "@/lib/fyxx";
import { MonthPicker } from "@/components/fyxx/date-picker";
import {
  REPORTS,
  reportsForPlatform,
  autoMap,
  loadMapping,
  saveMapping,
  parseCsv,
  validateSignature,
  parseDate,
  parseDateTime,
  parseOrderItems,
  isDelivered,
  isChargedCancelled,
  dateToMonth,
  monthFromColumns,
  num,
  round3,
  type Mapping,
  type ReportDef,
  type ReportId,
  type FieldDef,
} from "@/lib/csv-import";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/import")({
  head: () => ({ meta: [{ title: "CSV import · TGR" }] }),
  component: ImportPage,
});

/** A direct upsert batch. */
type UpsertGroup = {
  table: string;
  onConflict: string;
  rows: Record<string, unknown>[];
  /** If set, delete matching rows before upserting (replace-by-slice semantics). */
  replace?: { column: string; values: string[]; match?: Record<string, unknown> };
};
/** Read-back rollups run after the upserts land (keeps re-imports idempotent). */
type Reconcile = {
  careemDailyDates?: string[];
  financials?: { platform: Platform; months: string[] };
};
type Preview = {
  upserts: UpsertGroup[];
  reconcile?: Reconcile;
  willAdd: number;
  willUpdate: number;
  skipped: number;
  notes: string[];
  previewCols: string[];
  previewRows: Array<Record<string, string | number>>;
  rowFlags: boolean[]; // exists? per preview row
};

/** What has actually been imported for a month — based on the MEANINGFUL signal per slot,
 *  not mere row existence (Plus files write daily_sales rows with sales=0; Adjustments writes a
 *  financials row with gross=0 — neither should count as "Daily sales" / "Financials" imported). */
type ImportStatus = {
  slot: Partial<Record<ReportId, boolean>>;
  platform: Record<Platform, { daily: boolean; items: boolean; financials: boolean }>;
};
function useImportStatus(month: string) {
  return useQuery({
    queryKey: ["import_status", month],
    queryFn: async (): Promise<ImportStatus> => {
      const start = `${month}-01`;
      const end = `${month}-31`;
      const [orders, daily, items, fin, adj] = await Promise.all([
        supabase.from("platform_orders").select("platform").gte("date", start).lte("date", end),
        supabase
          .from("daily_sales")
          .select("platform,sales_jod,cplus_orders,cplus_sales_jod")
          .gte("date", start)
          .lte("date", end),
        supabase.from("monthly_item_sales").select("platform").eq("month", month),
        supabase.from("monthly_financials").select("platform,gross_sales").eq("month", month),
        supabase.from("monthly_adjustments").select("platform").eq("month", month),
      ]);
      const od = orders.data ?? [],
        dl = daily.data ?? [],
        it = items.data ?? [],
        fn = fin.data ?? [],
        aj = adj.data ?? [];
      const orderRows = (p: Platform) => od.some((r) => r.platform === p);
      const dailyReal = (p: Platform) => dl.some((r) => r.platform === p && Number(r.sales_jod) > 0);
      const itemsHas = (p: Platform) => it.some((r) => r.platform === p);
      const finReal = (p: Platform) => fn.some((r) => r.platform === p && Number(r.gross_sales) > 0);
      const adjHas = (p: Platform) => aj.some((r) => r.platform === p);
      const cplusO = dl.some((r) => r.platform === "Careem" && Number(r.cplus_orders) > 0);
      const cplusS = dl.some((r) => r.platform === "Careem" && Number(r.cplus_sales_jod) > 0);
      return {
        slot: {
          "talabat:order_report": orderRows("Talabat"),
          "talabat:performance": dailyReal("Talabat"),
          "careem:order_level": orderRows("Careem"),
          "careem:menu_item": itemsHas("Careem"),
          "careem:adjustments": adjHas("Careem"),
          "careem:plus_orders": cplusO,
          "careem:plus_sales": cplusS,
        },
        platform: {
          Talabat: {
            daily: dailyReal("Talabat"),
            items: itemsHas("Talabat"),
            financials: finReal("Talabat"),
          },
          Careem: {
            daily: dailyReal("Careem"),
            items: itemsHas("Careem"),
            financials: finReal("Careem"),
          },
        },
      };
    },
  });
}

function ImportPage() {
  const qc = useQueryClient();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [platform, setPlatform] = useState<Platform | null>(null);
  const [reportId, setReportId] = useState<ReportId | null>(null);
  const [checklistMonth, setChecklistMonth] = useState(currentMonth());
  const { data: importStatus } = useImportStatus(checklistMonth);

  const report = reportId ? REPORTS[reportId] : null;

  function restart() {
    setStep(1);
    setPlatform(null);
    setReportId(null);
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <PageHeader
        title="CSV import wizard"
        description="Four quick steps: pick a platform, pick a report, upload, then confirm."
      />

      <CompletenessPanel
        month={checklistMonth}
        onMonthChange={setChecklistMonth}
        status={importStatus}
      />

      <Stepper
        step={step}
        platform={platform}
        reportLabel={report?.label ?? null}
        onJump={(s) => {
          if (s < step) setStep(s as 1 | 2 | 3 | 4);
        }}
      />

      {step === 1 && (
        <Step1Platform
          value={platform}
          onPick={(p) => {
            setPlatform(p);
            setReportId(null);
            setStep(2);
          }}
        />
      )}

      {step === 2 && platform && (
        <Step2Report
          platform={platform}
          value={reportId}
          status={importStatus}
          month={checklistMonth}
          onBack={() => setStep(1)}
          onPick={(id) => {
            setReportId(id);
            setStep(3);
          }}
        />
      )}

      {step >= 3 && report && platform && (
        <CsvFlow
          key={report.id}
          report={report}
          platform={platform}
          qc={qc}
          step={step as 3 | 4}
          goNext={() => setStep(4)}
          goBack={() => setStep(step === 4 ? 3 : 2)}
          onDone={restart}
        />
      )}
    </div>
  );
}

/* ----- Wizard chrome ----- */

function Stepper({
  step,
  platform,
  reportLabel,
  onJump,
}: {
  step: 1 | 2 | 3 | 4;
  platform: Platform | null;
  reportLabel: string | null;
  onJump: (s: number) => void;
}) {
  const steps = [
    { n: 1, label: "Platform", sub: platform ?? "—" },
    { n: 2, label: "Report", sub: reportLabel ?? "—" },
    { n: 3, label: "Upload", sub: step >= 3 ? "in progress" : "—" },
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
              active && "border-primary bg-primary/10",
              done && "border-success/40 bg-success/5 hover:bg-success/10 cursor-pointer",
              !active && !done && "border-border bg-card opacity-70",
            )}
          >
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-wide font-semibold">
              <span
                className={cn(
                  "inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px]",
                  done
                    ? "bg-success/30 text-success"
                    : active
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                )}
              >
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
  value,
  onPick,
}: {
  value: Platform | null;
  onPick: (p: Platform) => void;
}) {
  return (
    <Card className="p-6">
      <div className="text-sm font-semibold mb-1">Step 1 — Which platform?</div>
      <p className="text-xs text-muted-foreground mb-4">
        Pick the delivery platform this report came from.
      </p>
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
                {p === "Talabat"
                  ? "Order Report + Performance Report"
                  : "Order Level, By Menu Item, Adjustments, Careem Plus"}
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function Step2Report({
  platform,
  value,
  status,
  month,
  onBack,
  onPick,
}: {
  platform: Platform;
  value: ReportId | null;
  status: ImportStatus | undefined;
  month: string;
  onBack: () => void;
  onPick: (id: ReportId) => void;
}) {
  const reports = reportsForPlatform(platform);
  return (
    <TooltipProvider delayDuration={200}>
      <Card className="p-6">
      <div className="flex items-center justify-between mb-1">
        <div className="text-sm font-semibold">Step 2 — Which report?</div>
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ChevronLeft className="size-3.5" /> Back
        </Button>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Pick the report you exported from {platform}. A green badge means that slot already has data
        for {month}.
      </p>
      <div className="grid sm:grid-cols-2 gap-3">
        {reports.map((r) => {
          const active = value === r.id;
          const imported = status?.slot?.[r.id] ?? false;
          return (
            <div
              key={r.id}
              className={cn(
                "rounded-xl border p-4 transition-colors",
                active ? "border-primary bg-primary/10" : "border-border bg-card hover:border-primary",
              )}
            >
              <button type="button" onClick={() => onPick(r.id)} className="block w-full text-left">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-semibold text-sm">{r.label}</div>
                  {imported ? (
                    <Badge
                      variant="outline"
                      className="shrink-0 bg-success/15 text-success border-success/30 text-[10px]"
                    >
                      <Check className="size-3 mr-1" /> Imported
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="shrink-0 text-muted-foreground text-[10px]">
                      Not yet
                    </Badge>
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground mt-1">{r.hint}</div>
              </button>
              <div className="flex items-center justify-between gap-2 mt-2 text-[10.5px]">
                <span>
                  <span className="text-muted-foreground">Lands in: </span>
                  <span className="font-mono">{r.table}</span>
                </span>
                {/* Deep-link to where this report lives in the partner portal (registry source);
                    hover shows the exact click-path inside the portal. */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <a
                      href={r.portalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex shrink-0 items-center gap-1 font-medium text-primary hover:underline"
                    >
                      {r.portalLabel} <ExternalLink className="size-3" />
                    </a>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs text-xs leading-relaxed">
                    {r.portalSteps}
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          );
        })}
      </div>
      </Card>
    </TooltipProvider>
  );
}

/* ----- Monthly completeness checklist (informational) ----- */

function CompletenessPanel({
  month,
  onMonthChange,
  status,
}: {
  month: string;
  onMonthChange: (m: string) => void;
  status: ImportStatus | undefined;
}) {
  const data = status?.platform;

  const rowsByPlatform: Record<
    Platform,
    { label: string; key: "daily" | "items" | "financials" }[]
  > = {
    Talabat: [
      { label: "Daily sales (Performance)", key: "daily" },
      { label: "Items (Order Report)", key: "items" },
      { label: "Financials (Order Report)", key: "financials" },
    ],
    Careem: [
      { label: "Daily sales (Order Level)", key: "daily" },
      { label: "Items (By Menu Item)", key: "items" },
      { label: "Financials (Order Level)", key: "financials" },
    ],
  };

  return (
    <Card className="p-5 mb-4">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div>
          <div className="text-sm font-semibold">Monthly completeness</div>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Informational only — you can always import any report. Margin / COGS calculations need
            items + financials for the month.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <Label className="text-muted-foreground text-xs">Month</Label>
          <div className="w-44">
            <MonthPicker value={month} onChange={onMonthChange} />
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        {PLATFORMS.map((p) => {
          const ps = data?.[p];
          const incomplete = ps && (!ps.items || !ps.financials);
          return (
            <div key={p} className="rounded-xl border border-border bg-background/40 p-4">
              <div className="font-display font-semibold mb-2">{p}</div>
              <ul className="space-y-1.5">
                {rowsByPlatform[p].map((row) => {
                  const ok = ps?.[row.key] ?? false;
                  return (
                    <li key={row.key} className="flex items-center gap-2 text-[12.5px]">
                      {ok ? (
                        <Check className="size-4 text-success" />
                      ) : (
                        <Circle className="size-4 text-muted-foreground" />
                      )}
                      <span className={ok ? "" : "text-muted-foreground"}>{row.label}</span>
                    </li>
                  );
                })}
              </ul>
              {incomplete && (
                <div className="mt-2 text-[10.5px] text-muted-foreground italic">
                  Margin incomplete — items / financials not yet imported for {month}.
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

function CsvFlow({
  report,
  platform,
  qc,
  step,
  goNext,
  goBack,
  onDone,
}: {
  report: ReportDef;
  platform: Platform;
  qc: ReturnType<typeof useQueryClient>;
  step: 3 | 4;
  goNext: () => void;
  goBack: () => void;
  onDone: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Mapping>({});
  const [preview, setPreview] = useState<Preview | null>(null);
  const [building, setBuilding] = useState(false);
  // Required fields whose expected header wasn't found — the ONLY thing the user maps by hand.
  const [manualFields, setManualFields] = useState<FieldDef[]>([]);

  /** Build the preview from explicit values (so we can run it before React state settles). */
  async function buildPreviewWith(
    m: Mapping,
    hdrs: string[],
    rows: Record<string, string>[],
  ): Promise<boolean> {
    setPreview(null);
    try {
      if (!report.positional) saveMapping(report.id, m);
      let chosenMonth = currentMonth();
      if (report.monthSource === "from-columns" && report.monthColumns) {
        const mo = monthFromColumns(rows, report.monthColumns);
        if (!mo)
          throw new Error(
            `Could not read ${report.monthColumns.from}/${report.monthColumns.to} from file.`,
          );
        chosenMonth = mo;
      }
      const built = await buildPreviewForReport(report, platform, chosenMonth, m, hdrs, rows);
      setPreview(built);
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    }
  }

  async function onFile(f: File | null) {
    setFile(f);
    setHeaders([]);
    setRawRows([]);
    setMapping({});
    setManualFields([]);
    setPreview(null);
    if (!f) return;
    setBuilding(true);
    try {
      const text = await f.text();
      const { headers, rows } = parseCsv(text);
      // Header validation stays: reject a mismatched file outright.
      const sigError = validateSignature(headers, report);
      if (sigError) {
        toast.error(sigError);
        setFile(null);
        return;
      }
      setHeaders(headers);
      setRawRows(rows);

      // Auto-apply the hardcoded expected-header → field mapping for this slot.
      let merged: Mapping = {};
      if (!report.positional) {
        const auto = autoMap(headers, report.id); // hardcoded defaults win
        const saved = loadMapping(report.id); // remembers any prior manual fix for a renamed header
        merged = { ...(saved ?? {}), ...auto };
        for (const k of Object.keys(merged)) {
          if (!headers.includes(merged[k])) delete merged[k];
        }
      }
      setMapping(merged);

      // Required fields still unmatched (header missing/renamed) need a manual control.
      // Optional fields (e.g. Pro Orders / Pro Revenue) left empty silently.
      const needsManual = report.fields.filter((f) => f.required && !merged[f.key]);
      setManualFields(needsManual);

      const ready = report.positional ? headers.length >= 2 : needsManual.length === 0;
      if (ready) {
        // Everything mapped automatically — go straight to preview, nothing for the user to map.
        const ok = await buildPreviewWith(merged, headers, rows);
        if (ok) goNext();
      }
    } finally {
      setBuilding(false);
    }
  }

  const readyToContinue =
    !!file && headers.length > 0 && manualFields.every((f) => !!mapping[f.key]);

  async function continueToPreview() {
    if (!readyToContinue) return;
    setBuilding(true);
    const ok = await buildPreviewWith(mapping, headers, rawRows);
    setBuilding(false);
    if (ok) goNext();
  }

  const importMut = useMutation({
    mutationFn: async () => {
      if (!preview) return;
      for (const g of preview.upserts) {
        if (g.replace) {
          // Delete the existing (platform, month) slice before inserting fresh rows so that
          // corrected values (e.g. sign fixes) fully replace stale rows rather than duplicating.
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let q = (supabase.from(g.table as any) as any).delete().in(g.replace.column, g.replace.values);
          if (g.replace.match) {
            for (const [k, v] of Object.entries(g.replace.match)) q = q.eq(k, v);
          }
          const { error: delErr } = await q;
          if (delErr) throw delErr;
        }
        for (let i = 0; i < g.rows.length; i += 500) {
          const chunk = g.rows.slice(i, i + 500);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error } = await (supabase.from(g.table as any) as any).upsert(chunk, {
            onConflict: g.onConflict,
          });
          if (error) throw error;
        }
      }
      if (preview.reconcile?.careemDailyDates?.length) {
        await reconcileCareemDaily(preview.reconcile.careemDailyDates);
      }
      if (preview.reconcile?.financials?.months.length) {
        await reconcileFinancials(
          preview.reconcile.financials.platform,
          preview.reconcile.financials.months,
        );
      }
      const totalRows = preview.upserts.reduce((s, g) => s + g.rows.length, 0);
      await supabase.from("import_log").insert({
        platform,
        report_type: report.id,
        file_name: file?.name ?? "csv",
        rows_imported: totalRows,
        status: "success",
      });
    },
    onSuccess: () => {
      const total = preview?.upserts.reduce((s, g) => s + g.rows.length, 0) ?? 0;
      toast.success(`Imported ${total} row(s)`);
      setFile(null);
      setHeaders([]);
      setRawRows([]);
      setPreview(null);
      qc.invalidateQueries();
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      {step === 3 && (
        <>
          <Card className="p-5 mt-4 space-y-4">
            <div className="text-sm font-semibold">Step 3 — Upload {report.label}</div>
            <div className="flex items-start justify-between gap-3 rounded-md border border-border bg-muted/30 p-3">
              <div className="text-xs text-muted-foreground">{report.hint}</div>
              <a
                href={report.portalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-primary hover:underline"
              >
                {report.portalLabel} <ExternalLink className="size-3.5" />
              </a>
            </div>
            <div>
              <Label className="text-xs">CSV file</Label>
              <div className="mt-1.5 flex items-center gap-3">
                <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-2 rounded-md border border-border bg-card hover:bg-accent text-sm">
                  <Upload className="size-4" />
                  {file ? "Replace file" : "Choose CSV"}
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(e) => onFile(e.target.files?.[0] ?? null)}
                  />
                </label>
                {file && (
                  <span className="text-sm text-muted-foreground">
                    {file.name} · {rawRows.length} rows
                  </span>
                )}
              </div>
            </div>
          </Card>

          {building && (
            <Card className="p-5 mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Reading &amp; validating {file?.name}…
            </Card>
          )}

          {/* Auto-mapping found every required column → we've already jumped to the preview.
              This card only appears for a required column whose expected header is missing/renamed. */}
          {!building && manualFields.length > 0 && (
            <Card className="p-5 mt-4 space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
                <AlertCircle className="size-4" />
                {report.platform} ▸ {report.label}: {manualFields.length} expected column
                {manualFields.length > 1 ? "s" : ""} not found
              </div>
              <p className="text-xs text-muted-foreground">
                Everything else was matched automatically. Pick the matching column for each item
                below, or re-export the report so the headers match.
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                {manualFields.map((f) => (
                  <Field key={f.key} label={f.label}>
                    <div className="mb-1 text-[11px] text-destructive">
                      Expected “{f.defaults[0]}” — not found in this file.
                    </div>
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
                      <SelectTrigger>
                        <SelectValue placeholder="— pick column —" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">— none —</SelectItem>
                        {headers.map((h) => (
                          <SelectItem key={h} value={h}>
                            {h}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                ))}
              </div>
            </Card>
          )}

          <div className="mt-4 flex justify-between">
            <Button variant="ghost" onClick={goBack}>
              <ChevronLeft className="size-3.5" /> Back
            </Button>
            {file && headers.length > 0 && (
              <Button
                onClick={continueToPreview}
                disabled={!readyToContinue || building}
                className="bg-gradient-primary text-primary-foreground"
              >
                {building && <Loader2 className="size-4 animate-spin mr-2" />}
                Continue to preview <ChevronRight className="size-3.5" />
              </Button>
            )}
          </div>
        </>
      )}

      {step === 4 && preview && (
        <Card className="p-5 mt-4 space-y-4">
          <div className="text-sm font-semibold">Step 4 — Preview &amp; confirm</div>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="text-sm font-semibold flex items-center gap-2">
              <CheckCircle2 className="size-4 text-success" /> Preview
            </div>
            <div className="flex gap-2 text-xs">
              <Badge variant="outline" className="bg-success/15 text-success border-success/30">
                Will add {preview.willAdd}
              </Badge>
              <Badge variant="outline" className="bg-primary/15 text-primary border-primary/30">
                Will update {preview.willUpdate}
              </Badge>
              {preview.skipped > 0 && (
                <Badge variant="outline" className="text-muted-foreground">
                  Skipped {preview.skipped}
                </Badge>
              )}
            </div>
          </div>
          {preview.notes.length > 0 && (
            <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-5">
              {preview.notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          )}

          <div className="overflow-x-auto border border-border rounded-md max-h-96">
            <Table>
              <TableHeader>
                <TableRow>
                  {preview.previewCols.map((c) => (
                    <TableHead key={c}>{c}</TableHead>
                  ))}
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.previewRows.slice(0, 200).map((r, i) => (
                  <TableRow key={i}>
                    {preview.previewCols.map((c) => (
                      <TableCell key={c} className="text-num">
                        {r[c] as React.ReactNode}
                      </TableCell>
                    ))}
                    <TableCell>
                      {preview.rowFlags[i] ? (
                        <Badge
                          variant="outline"
                          className="bg-primary/15 text-primary border-primary/30"
                        >
                          update
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="bg-success/15 text-success border-success/30"
                        >
                          add
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {preview.previewRows.length > 200 && (
            <div className="text-[11px] text-muted-foreground">
              Showing first 200 of {preview.previewRows.length} parsed rows. All rows will be
              imported.
            </div>
          )}

          <div className="flex justify-between">
            <Button
              variant="ghost"
              onClick={() => {
                setPreview(null);
                goBack();
              }}
            >
              <ChevronLeft className="size-3.5" /> Back to upload
            </Button>
            <Button
              onClick={() => importMut.mutate()}
              disabled={importMut.isPending || preview.upserts.every((g) => g.rows.length === 0)}
              className="bg-gradient-primary text-primary-foreground"
            >
              {importMut.isPending && <Loader2 className="size-4 animate-spin mr-2" />}
              Confirm import
            </Button>
          </div>
        </Card>
      )}

      {step === 4 && !preview && (
        <Card className="p-5 mt-4 text-sm text-muted-foreground">
          No preview built yet.{" "}
          <button className="underline" onClick={goBack}>
            Go back to upload
          </button>
          .
        </Card>
      )}
    </>
  );
}

/* =========================================================================
   Read-back reconcile (run after upserts; keeps re-imports idempotent)
   ========================================================================= */

/** Recompute Careem daily_sales (sales + orders) from per-order rows for the given dates. */
async function reconcileCareemDaily(dates: string[]) {
  const uniq = Array.from(new Set(dates));
  for (let i = 0; i < uniq.length; i += 200) {
    const chunkDates = uniq.slice(i, i + 200);
    const { data, error } = await supabase
      .from("platform_orders")
      .select("date,gross,status")
      .eq("platform", "Careem")
      .in("date", chunkDates);
    if (error) throw error;
    const byDate = new Map<string, { sales: number; orders: number }>();
    for (const d of chunkDates) byDate.set(d, { sales: 0, orders: 0 });
    for (const o of data ?? []) {
      if (!isDelivered(o.status)) continue;
      const cur = byDate.get(o.date) ?? { sales: 0, orders: 0 };
      cur.sales += Number(o.gross);
      cur.orders += 1;
      byDate.set(o.date, cur);
    }
    const rows = Array.from(byDate.entries()).map(([date, v]) => ({
      date,
      platform: "Careem",
      sales_jod: round3(v.sales),
      orders: v.orders,
    }));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: upErr } = await (supabase.from("daily_sales") as any).upsert(rows, {
      onConflict: "date,platform",
    });
    if (upErr) throw upErr;
  }
}

/** Recompute monthly_financials (gross, payout, fees, orders) from per-order rows
 *  + Careem adjustments, for the given months. COGS is never written (preserved). */
async function reconcileFinancials(platform: Platform, months: string[]) {
  for (const month of Array.from(new Set(months))) {
    const start = `${month}-01`,
      end = `${month}-31`;
    const { data: orders, error } = await supabase
      .from("platform_orders")
      .select("gross,net_payout,commission,payment_fee,platform_fee,discount,status")
      .eq("platform", platform)
      .gte("date", start)
      .lte("date", end);
    if (error) throw error;
    const isTalabat = platform === "Talabat";
    let gross = 0,
      payout = 0,
      commission = 0,
      discount = 0,
      orderCount = 0;
    for (const o of orders ?? []) {
      const delivered = isDelivered(o.status);
      // Talabat's report contains ONLY Successful + Charged Cancelled by spec, so payout/fees span
      // ALL stored orders (Charged Cancelled carries commission with a negative payout). Careem =
      // delivered only. NB: commission is TOTAL platform fees INCL VAT (not the ex-VAT 20% rate) —
      // never divide by GMV.
      if (delivered || isTalabat) {
        payout += Number(o.net_payout);
        commission += Number(o.commission) + Number(o.payment_fee) + Number(o.platform_fee);
      }
      // Revenue side — Successful only (Charged Cancelled has no revenue / no discount).
      // discount = the menu-value → net-sales bridge (Talabat Voucher / Careem catalog+promo).
      if (delivered) {
        gross += Number(o.gross);
        discount += Number(o.discount);
        orderCount += 1;
      }
      // Surface any Talabat status that isn't Successful or Charged Cancelled, rather than let it
      // silently enter the payout total.
      if (isTalabat && !delivered && !isChargedCancelled(o.status)) {
        console.warn(
          `[import] Talabat order with unexpected status "${o.status}" entered the ${month} payout total (expected Delivered or Charged Cancelled).`,
        );
      }
    }
    if (platform === "Careem") {
      const { data: adj, error: aerr } = await supabase
        .from("monthly_adjustments")
        .select("amount")
        .eq("platform", "Careem")
        .eq("month", month);
      if (aerr) throw aerr;
      payout += (adj ?? []).reduce((s, a) => s + Number(a.amount), 0);
    }
    const payload = {
      month,
      platform,
      gross_sales: round3(gross),
      actual_payout: round3(payout),
      commission: round3(commission),
      discount: round3(discount),
      orders: orderCount,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: upErr } = await (supabase.from("monthly_financials") as any).upsert(payload, {
      onConflict: "month,platform",
    });
    if (upErr) throw upErr;
  }
}

/* =========================================================================
   Preview builders
   ========================================================================= */

async function buildPreviewForReport(
  report: ReportDef,
  platform: Platform,
  month: string,
  mapping: Mapping,
  headers: string[],
  rows: Record<string, string>[],
): Promise<Preview> {
  switch (report.id) {
    case "talabat:order_report":
      return buildTalabatOrders(platform, mapping, rows);
    case "talabat:performance":
      return buildPerformance(platform, mapping, rows);
    case "careem:order_level":
      return buildCareemOrders(platform, mapping, rows);
    case "careem:menu_item":
      return buildCareemItems(platform, month, mapping, rows);
    case "careem:adjustments":
      return buildAdjustments(platform, mapping, rows);
    case "careem:plus_orders":
    case "careem:plus_sales":
      return buildPlus(report, platform, headers, rows);
    default:
      throw new Error(`No builder for ${report.id}`);
  }
}

/** Look up which keys already exist, in chunks. */
async function existingKeys(
  table: string,
  column: string,
  platform: Platform,
  keys: string[],
  extra?: (q: ReturnType<typeof supabase.from>) => unknown,
): Promise<Set<string>> {
  const set = new Set<string>();
  for (let i = 0; i < keys.length; i += 300) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = (supabase.from as any)(table)
      .select(column)
      .eq("platform", platform)
      .in(column, keys.slice(i, i + 300));
    if (extra) q = extra(q) ?? q;
    const { data } = await q;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (data ?? []).forEach((d: any) => set.add(String(d[column])));
  }
  return set;
}

async function buildTalabatOrders(
  platform: Platform,
  m: Mapping,
  rows: Record<string, string>[],
): Promise<Preview> {
  const orderRows: Record<string, unknown>[] = [];
  const orderIds: string[] = [];
  const itemAgg = new Map<string, Map<string, number>>(); // month -> name -> units
  const monthsSet = new Set<string>();
  const previewRows: Array<Record<string, string | number>> = [];
  let skipped = 0;

  for (const r of rows) {
    const order_id = (r[m.order_id] ?? "").trim();
    const date = parseDate(r[m.order_dt]);
    if (!order_id || !date) {
      skipped++;
      continue;
    }
    const month = dateToMonth(date);
    monthsSet.add(month);
    const gross = round3(num(r[m.gross]));
    const net_payout = round3(num(r[m.net_payout]));
    const commission = m.commission ? round3(Math.abs(num(r[m.commission]))) : 0;
    const payment_fee = m.payment_fee ? round3(Math.abs(num(r[m.payment_fee]))) : 0;
    const discount = round3(
      (m.discount ? Math.abs(num(r[m.discount])) : 0) +
        (m.voucher ? Math.abs(num(r[m.voucher])) : 0),
    );
    const is_loyalty = m.is_pro
      ? String(r[m.is_pro] ?? "")
          .trim()
          .toUpperCase() === "Y"
      : null;
    const status = (r[m.status] ?? "").trim() || null;
    orderRows.push({
      platform,
      order_id,
      ordered_at: parseDateTime(r[m.order_dt]),
      date,
      status,
      gross,
      net_payout,
      commission,
      payment_fee,
      platform_fee: 0,
      discount,
      is_loyalty,
    });
    orderIds.push(order_id);
    if (m.items_text) {
      const per = itemAgg.get(month) ?? new Map<string, number>();
      for (const it of parseOrderItems(r[m.items_text]))
        per.set(it.name, (per.get(it.name) ?? 0) + it.qty);
      itemAgg.set(month, per);
    }
    previewRows.push({
      "Order ID": order_id,
      Date: date,
      Gross: fmtJOD(gross),
      Payout: fmtJOD(net_payout),
      Pro: is_loyalty == null ? "—" : is_loyalty ? "Yes" : "No",
      Status: status ?? "",
    });
  }

  const existingSet = await existingKeys("platform_orders", "order_id", platform, orderIds);
  const rowFlags = orderRows.map((o) => existingSet.has(o.order_id as string));
  const willUpdate = rowFlags.filter(Boolean).length;

  const itemRows: Record<string, unknown>[] = [];
  for (const [month, per] of itemAgg)
    for (const [name, units] of per)
      itemRows.push({ month, platform, item_name: name, units: Math.round(units), revenue_jod: 0 });

  const months = Array.from(monthsSet).sort();
  const notes = [
    `${orderRows.length} order(s) → platform_orders (idempotent by order id).`,
    itemRows.length
      ? `${itemRows.length} item line(s) parsed from "Order Items" → monthly_item_sales (units only — Talabat has no per-item price). Upload the full month so item totals are complete.`
      : "",
    `Monthly financials recomputed for ${months.join(", ")} from these orders (Delivered only).`,
    "Daily totals for Talabat come from the Performance report, not this file.",
    skipped ? `${skipped} row(s) skipped (no order id / date).` : "",
  ].filter(Boolean);

  return {
    upserts: [
      { table: "platform_orders", onConflict: "platform,order_id", rows: orderRows },
      ...(itemRows.length
        ? [{ table: "monthly_item_sales", onConflict: "month,platform,item_name", rows: itemRows }]
        : []),
    ],
    reconcile: { financials: { platform, months } },
    willAdd: rowFlags.length - willUpdate,
    willUpdate,
    skipped,
    notes,
    previewCols: ["Order ID", "Date", "Gross", "Payout", "Pro", "Status"],
    previewRows,
    rowFlags,
  };
}

async function buildPerformance(
  platform: Platform,
  m: Mapping,
  rows: Record<string, string>[],
): Promise<Preview> {
  const hasPro = !!(m.pro_orders || m.pro_sales);
  const grouped = new Map<
    string,
    { sales: number; orders: number; pro_orders: number; pro_sales: number }
  >();
  let skipped = 0;
  for (const r of rows) {
    const date = parseDate(r[m.date]);
    if (!date) {
      skipped++;
      continue;
    }
    grouped.set(date, {
      sales: round3(num(r[m.sales_jod])),
      orders: Math.round(num(r[m.orders])),
      pro_orders: m.pro_orders ? Math.round(num(r[m.pro_orders])) : 0,
      pro_sales: m.pro_sales ? round3(num(r[m.pro_sales])) : 0,
    });
  }
  const dates = Array.from(grouped.keys());
  const existingSet = await existingKeys("daily_sales", "date", platform, dates);

  const opsRows: Record<string, unknown>[] = [];
  const previewRows: Array<Record<string, string | number>> = [];
  const rowFlags: boolean[] = [];
  for (const [date, g] of Array.from(grouped.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    rowFlags.push(existingSet.has(date));
    const payload: Record<string, unknown> = {
      date,
      platform,
      sales_jod: g.sales,
      orders: g.orders,
    };
    if (hasPro) {
      payload.pro_orders = g.pro_orders;
      payload.pro_sales_jod = g.pro_sales;
    }
    opsRows.push(payload);
    const row: Record<string, string | number> = {
      Date: date,
      Sales: fmtJOD(g.sales),
      Orders: fmtInt(g.orders),
    };
    if (hasPro) {
      row["Pro orders"] = fmtInt(g.pro_orders);
      row["Pro sales"] = fmtJOD(g.pro_sales);
    }
    previewRows.push(row);
  }
  const willUpdate = rowFlags.filter(Boolean).length;
  const notes = [
    `Platform set to ${platform}.`,
    hasPro
      ? "Talabat Pro orders / revenue will be stored alongside the daily totals."
      : "No Pro columns mapped — Pro tier panel stays empty for these days.",
    skipped ? `${skipped} row(s) skipped (no valid date).` : "",
  ].filter(Boolean);
  return {
    upserts: [{ table: "daily_sales", onConflict: "date,platform", rows: opsRows }],
    willAdd: rowFlags.length - willUpdate,
    willUpdate,
    skipped,
    notes,
    previewCols: ["Date", "Sales", "Orders", ...(hasPro ? ["Pro orders", "Pro sales"] : [])],
    previewRows,
    rowFlags,
  };
}

async function buildCareemOrders(
  platform: Platform,
  m: Mapping,
  rows: Record<string, string>[],
): Promise<Preview> {
  const orderRows: Record<string, unknown>[] = [];
  const orderIds: string[] = [];
  const previewRows: Array<Record<string, string | number>> = [];
  const datesSet = new Set<string>();
  const monthsSet = new Set<string>();
  let skipped = 0,
    filtered = 0;

  for (const r of rows) {
    if (
      m.entry_type &&
      String(r[m.entry_type] ?? "")
        .trim()
        .toUpperCase() !== "FOOD_ORDER"
    ) {
      filtered++;
      continue;
    }
    const order_id = (r[m.order_id] ?? "").trim();
    const date = parseDate(r[m.order_dt]);
    if (!order_id || !date) {
      skipped++;
      continue;
    }
    datesSet.add(date);
    monthsSet.add(dateToMonth(date));
    const gross = round3(num(r[m.gross]));
    const net_payout = round3(num(r[m.net_payout]));
    const platform_fee = round3(
      (m.platform_fee ? Math.abs(num(r[m.platform_fee])) : 0) +
        (m.platform_fee_tax ? Math.abs(num(r[m.platform_fee_tax])) : 0),
    );
    const payment_fee = round3(
      (m.gateway_fee ? Math.abs(num(r[m.gateway_fee])) : 0) +
        (m.gateway_fee_tax ? Math.abs(num(r[m.gateway_fee_tax])) : 0),
    );
    const discount = round3(
      (m.discount_catalog ? Math.abs(num(r[m.discount_catalog])) : 0) +
        (m.discount_promo ? Math.abs(num(r[m.discount_promo])) : 0),
    );
    const status = (r[m.status] ?? "").trim() || null;
    orderRows.push({
      platform,
      order_id,
      ordered_at: parseDateTime(r[m.order_dt]),
      date,
      status,
      gross,
      net_payout,
      commission: 0,
      payment_fee,
      platform_fee,
      discount,
      is_loyalty: null,
      payment_mode: m.payment_mode ? (r[m.payment_mode] ?? "").trim() || null : null,
    });
    orderIds.push(order_id);
    previewRows.push({
      "Order ID": order_id,
      Date: date,
      Gross: fmtJOD(gross),
      Payout: fmtJOD(net_payout),
      Fees: fmtJOD(platform_fee + payment_fee),
      Status: status ?? "",
    });
  }

  const existingSet = await existingKeys("platform_orders", "order_id", platform, orderIds);
  const rowFlags = orderRows.map((o) => existingSet.has(o.order_id as string));
  const willUpdate = rowFlags.filter(Boolean).length;
  const months = Array.from(monthsSet).sort();
  const notes = [
    `${orderRows.length} FOOD_ORDER row(s) → platform_orders (idempotent by order id).`,
    filtered ? `${filtered} non-FOOD_ORDER row(s) ignored.` : "",
    "Fees stored as positive magnitudes (platform + gateway, incl. tax).",
    `Daily totals and monthly financials recomputed for the affected dates / months (${months.join(", ")}), Delivered only.`,
    skipped ? `${skipped} row(s) skipped (no order id / date).` : "",
  ].filter(Boolean);

  return {
    upserts: [{ table: "platform_orders", onConflict: "platform,order_id", rows: orderRows }],
    reconcile: { careemDailyDates: Array.from(datesSet), financials: { platform, months } },
    willAdd: rowFlags.length - willUpdate,
    willUpdate,
    skipped,
    notes,
    previewCols: ["Order ID", "Date", "Gross", "Payout", "Fees", "Status"],
    previewRows,
    rowFlags,
  };
}

async function buildCareemItems(
  platform: Platform,
  month: string,
  m: Mapping,
  rows: Record<string, string>[],
): Promise<Preview> {
  const hasRevenue = Boolean(m.revenue_jod);
  const grouped = new Map<string, { units: number; revenue: number }>();
  let skipped = 0;
  for (const r of rows) {
    const name = (r[m.item_name] ?? "").trim();
    if (!name) {
      skipped++;
      continue;
    }
    const cur = grouped.get(name) ?? { units: 0, revenue: 0 };
    cur.units += num(r[m.units]);
    cur.revenue += hasRevenue ? num(r[m.revenue_jod]) : 0;
    grouped.set(name, cur);
  }
  const items = Array.from(grouped.keys());
  const existingSet = await existingKeys(
    "monthly_item_sales",
    "item_name",
    platform,
    items,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (q: any) => q.eq("month", month),
  );

  const opsRows: Record<string, unknown>[] = [];
  const previewRows: Array<Record<string, string | number>> = [];
  const rowFlags: boolean[] = [];
  const entries = Array.from(grouped.entries()).sort((a, b) =>
    hasRevenue ? b[1].revenue - a[1].revenue : b[1].units - a[1].units,
  );
  for (const [name, agg] of entries) {
    rowFlags.push(existingSet.has(name));
    opsRows.push({
      month,
      platform,
      item_name: name,
      units: Math.round(agg.units),
      revenue_jod: round3(agg.revenue),
    });
    previewRows.push(
      hasRevenue
        ? { Item: name, Units: fmtInt(agg.units), Revenue: fmtJOD(agg.revenue) }
        : { Item: name, Units: fmtInt(agg.units) },
    );
  }
  const willUpdate = rowFlags.filter(Boolean).length;
  const notes = [
    `All ${items.length} item(s) tagged with period ${month} on ${platform}.`,
    hasRevenue
      ? "Revenue (JOD) per item will be stored."
      : "No revenue column mapped — revenue saves as 0 (Insights ranks by units).",
    skipped ? `${skipped} row(s) skipped (blank name).` : "",
  ].filter(Boolean);
  return {
    upserts: [
      { table: "monthly_item_sales", onConflict: "month,platform,item_name", rows: opsRows },
    ],
    willAdd: rowFlags.length - willUpdate,
    willUpdate,
    skipped,
    notes,
    previewCols: hasRevenue ? ["Item", "Units", "Revenue"] : ["Item", "Units"],
    previewRows,
    rowFlags,
  };
}

// Careem Adjustments CATEGORY values that are NOT payout-reducing fees, so we drop them:
//  - ON_DEMAND_PAYOUT = a cashout of money already earned/counted, not a cost.
//  - Carry-over / brought-forward / rollover = the prior cycle's below-threshold payout rolling
//    forward — a POSITIVE cashflow line; summing it as income/cost double-counts.
// CLAWBACK (the customer-complaint deduction) is NOT here — it's a real loss and stays in: the
// clawed-back order still appears as a full positive Delivered order in Order Level, so the
// clawback is an extra deduction not already reflected.
// Credits (e.g. COMPENSATIONS) are positive in the export and are real income — do NOT drop them.
// Only drop rows whose category is a pure cashflow item (carry-over, cashout), not genuine P&L.
const ADJ_EXCLUDED = new Set([
  "ON_DEMAND_PAYOUT",
  "CARRY_OVER",
  "CARRYOVER",
  "BROUGHT_FORWARD",
  "ROLLOVER",
  "PREVIOUS_CYCLE",
]);

async function buildAdjustments(
  platform: Platform,
  m: Mapping,
  rows: Record<string, string>[],
): Promise<Preview> {
  const adjRows: Record<string, unknown>[] = [];
  const previewRows: Array<Record<string, string | number>> = [];
  const monthsSet = new Set<string>();
  let skipped = 0;
  let filtered = 0;
  for (const r of rows) {
    const deduction_type = (r[m.deduction_type] ?? "").trim();
    const date = parseDate(r[m.date]);
    if (!deduction_type || !date) {
      skipped++;
      continue;
    }
    // Store the signed amount from the export: fees are negative, credits (COMPENSATIONS etc.) are
    // positive. Drop only denylisted cashflow categories (carry-over, cashout).
    const rawAmount = num(r[m.amount]);
    if (ADJ_EXCLUDED.has(deduction_type.trim().toUpperCase())) {
      filtered++;
      continue;
    }
    const month = dateToMonth(date);
    monthsSet.add(month);
    let order_id = (m.order_id ? (r[m.order_id] ?? "") : "").trim();
    if (!order_id || order_id === "-") order_id = "-";
    const amount = round3(rawAmount);
    adjRows.push({
      platform,
      date,
      month,
      deduction_type,
      order_id,
      amount,
      comments: m.comments ? (r[m.comments] ?? "").trim() || null : null,
    });
    previewRows.push({ Date: date, Type: deduction_type, Amount: fmtJOD(amount), Order: order_id });
  }
  const months = Array.from(monthsSet).sort();
  const notes = [
    `${adjRows.length} adjustment row(s) → monthly_adjustments (signed: fees negative, credits positive).`,
    filtered
      ? `${filtered} row(s) excluded as cashout / carry-over (ON_DEMAND_PAYOUT or rollover categories).`
      : "",
    `Monthly financials payout recomputed for ${months.join(", ")}.`,
    "Re-importing the same export is safe — rows dedupe on (date, type, order, amount).",
    skipped ? `${skipped} row(s) skipped (no type / date).` : "",
  ].filter(Boolean);
  return {
    upserts: [
      {
        table: "monthly_adjustments",
        onConflict: "platform,date,deduction_type,order_id,amount",
        rows: adjRows,
        replace: { column: "month", values: months, match: { platform } },
      },
    ],
    reconcile: { financials: { platform, months } },
    willAdd: adjRows.length,
    willUpdate: 0,
    skipped,
    notes,
    previewCols: ["Date", "Type", "Amount", "Order"],
    previewRows,
    rowFlags: adjRows.map(() => false),
  };
}

async function buildPlus(
  report: ReportDef,
  platform: Platform,
  headers: string[],
  rows: Record<string, string>[],
): Promise<Preview> {
  const dateCol = headers[0],
    valueCol = headers[1];
  const isOrders = report.id === "careem:plus_orders";
  const col = isOrders ? "cplus_orders" : "cplus_sales_jod";
  const grouped = new Map<string, number>();
  let skipped = 0;
  for (const r of rows) {
    const date = parseDate(r[dateCol]);
    if (!date) {
      skipped++;
      continue;
    }
    grouped.set(date, num(r[valueCol]));
  }
  const dates = Array.from(grouped.keys());
  const existingSet = await existingKeys("daily_sales", "date", platform, dates);

  const opsRows: Record<string, unknown>[] = [];
  const previewRows: Array<Record<string, string | number>> = [];
  const rowFlags: boolean[] = [];
  const label = isOrders ? "Plus orders" : "Plus sales";
  for (const [date, v] of Array.from(grouped.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    rowFlags.push(existingSet.has(date));
    opsRows.push({ date, platform, [col]: isOrders ? Math.round(v) : round3(v) });
    previewRows.push({ Date: date, [label]: isOrders ? fmtInt(v) : fmtJOD(v) });
  }
  const willUpdate = rowFlags.filter(Boolean).length;
  const notes = [
    `Value read from the 2nd column ("${valueCol}") — its header is ignored.`,
    `Writes Careem Plus ${isOrders ? "orders" : "sales"} into daily_sales (loyalty), without touching the overall totals.`,
    skipped ? `${skipped} row(s) skipped (no valid date).` : "",
  ].filter(Boolean);
  return {
    upserts: [{ table: "daily_sales", onConflict: "date,platform", rows: opsRows }],
    willAdd: rowFlags.length - willUpdate,
    willUpdate,
    skipped,
    notes,
    previewCols: ["Date", label],
    previewRows,
    rowFlags,
  };
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
