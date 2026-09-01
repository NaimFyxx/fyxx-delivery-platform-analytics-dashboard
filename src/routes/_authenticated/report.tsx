import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getDashboardData } from "@/lib/dashboard.functions";
import { loadDbAliases } from "@/lib/aliases";
import { completeMonths, exportReportPdf } from "@/lib/report";
import { runDataHealthChecks, checkReportConsistency, type HealthCheck } from "@/lib/data-health";
import { PageHeader } from "@/components/fyxx/page-header";
import { DesktopOnly } from "@/components/fyxx/desktop-only";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/report")({
  head: () => ({ meta: [{ title: "Executive report · TGR" }] }),
  component: ReportPage,
});

const monthName = (mk: string) => new Date(`${mk}-01T00:00:00`).toLocaleString("en-US", { month: "long" });

function ReportPage() {
  const fetchData = useServerFn(getDashboardData);
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => fetchData(),
    refetchOnWindowFocus: false,
  });
  const { data: dbAliases = {} } = useQuery({
    queryKey: ["item_aliases"],
    queryFn: loadDbAliases,
    staleTime: 60_000,
  });

  // Only complete months with data are selectable; the in-progress month is excluded.
  const months = useMemo(() => (data ? completeMonths(data) : []), [data]);
  const years = useMemo(
    () => Array.from(new Set(months.map((m) => m.slice(0, 4)))).sort().reverse(),
    [months],
  );

  // Default to the latest complete month (the previous hardcoded behaviour).
  const [selected, setSelected] = useState<string>("");
  const monthKey = selected || months[months.length - 1] || "";
  const year = monthKey.slice(0, 4);
  const monthsInYear = useMemo(() => months.filter((m) => m.startsWith(year)), [months, year]);

  const [busy, setBusy] = useState(false);

  // Non-blocking data-health gate: surface any failing/warning check for the selected month
  // (and a report-consistency check on the report's own YTD/combined additivity) before generating.
  const health = useMemo(() => (data ? runDataHealthChecks(data, dbAliases) : null), [data, dbAliases]);
  const flagged = useMemo<HealthCheck[]>(() => {
    if (!data || !monthKey) return [];
    const mo = health?.months.find((m) => m.month === monthKey);
    const out: HealthCheck[] = mo ? mo.checks.filter((c) => c.status !== "pass") : [];

    // Check 5: report YTD equals the sum of its monthly figures, and combined equals the platform
    // rows. Computed at full precision from the same figures the report uses.
    const yr = monthKey.slice(0, 4);
    const window = months.filter((m) => m.startsWith(yr) && m <= monthKey);
    const grossFor = (mm: string, p?: string) =>
      data.financials.filter((f) => f.month === mm && (!p || f.platform === p)).reduce((s, f) => s + f.gross, 0);
    const monthlyGross = window.map((mm) => grossFor(mm));
    const consistency = checkReportConsistency({
      monthlyGross,
      ytdGross: monthlyGross.reduce((s, v) => s + v, 0),
      talabatYtdGross: window.reduce((s, mm) => s + grossFor(mm, "Talabat"), 0),
      careemYtdGross: window.reduce((s, mm) => s + grossFor(mm, "Careem"), 0),
      combinedYtdGross: window.reduce((s, mm) => s + grossFor(mm), 0),
    });
    if (consistency.status !== "pass") out.push(consistency);
    return out;
  }, [data, monthKey, months, health]);

  const worst = flagged.some((c) => c.status === "fail") ? "fail" : flagged.length ? "warn" : "pass";

  function onGenerate() {
    if (!data || !monthKey) return;
    setBusy(true);
    try {
      const res = exportReportPdf(data, dbAliases, { monthKey, preparedBy: "Lori Ketchijian" });
      if (!res.ok) toast.error(res.error ?? "Could not generate the report");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <DesktopOnly title="Executive report">
    <div className="p-6 max-w-3xl mx-auto">
      <PageHeader
        title="Generate executive report"
        description="A one-page PDF summary for a single month: performance, the money trail, by-platform margins, menu signals and the sales trend. Opens ready to save as PDF."
      />

      <Card className="p-6 mt-2">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-6">
            <Loader2 className="size-4 animate-spin" /> Loading data…
          </div>
        ) : months.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6">
            No completed month of data yet. Import a full month first, then generate its report.
          </p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground mb-4 max-w-xl leading-relaxed">
              Pick a completed month. The report always compares that calendar month against the year
              to date and the prior month, so a single month is selected, not a date range. The
              in-progress month is not available until it is complete.
            </p>
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Year</Label>
                <Select
                  value={year}
                  onValueChange={(y) => {
                    const inY = months.filter((m) => m.startsWith(y));
                    setSelected(inY[inY.length - 1] ?? "");
                  }}
                >
                  <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Month</Label>
                <Select value={monthKey} onValueChange={setSelected}>
                  <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {monthsInYear.map((m) => <SelectItem key={m} value={m}>{monthName(m)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button
                className="bg-gradient-primary text-primary-foreground"
                onClick={onGenerate}
                disabled={busy || !monthKey}
              >
                {busy ? <Loader2 className="size-4 animate-spin mr-2" /> : <FileText className="size-4 mr-2" />}
                Generate report
              </Button>
            </div>

            {flagged.length > 0 && (
              <div
                className="mt-5 rounded-md border p-3.5"
                style={{
                  borderColor: worst === "fail" ? "var(--destructive)" : "#EEC36A",
                  background: worst === "fail" ? "color-mix(in srgb, var(--destructive) 8%, transparent)" : "color-mix(in srgb, #EEC36A 12%, transparent)",
                }}
              >
                <div className="text-sm font-semibold mb-1.5">
                  {worst === "fail"
                    ? `Data health flagged ${monthName(monthKey)} before you generate`
                    : `${monthName(monthKey)} has data-health warnings`}
                </div>
                <p className="text-xs text-muted-foreground mb-2.5">
                  The report will still generate. These are worth checking first so the figures are not built on partial data.
                </p>
                <ul className="space-y-1.5">
                  {flagged.map((c, i) => (
                    <li key={i} className="flex items-start gap-2 text-[12px] leading-relaxed">
                      <span
                        className="mt-1.5 inline-block w-2 h-2 rounded-full shrink-0"
                        style={{ background: c.status === "fail" ? "var(--destructive)" : "#EEC36A" }}
                      />
                      <span>
                        <span className="font-medium">{c.label}{c.scope ? ` · ${c.scope}` : ""}:</span>{" "}
                        <span className="text-muted-foreground">{c.detail}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
    </DesktopOnly>
  );
}
