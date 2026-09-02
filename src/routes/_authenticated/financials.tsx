import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getDashboardData } from "@/lib/dashboard.functions";
import { moneyTrail } from "@/lib/money-trail";
import { PageHeader } from "@/components/fyxx/page-header";
import { InfoTip } from "@/components/fyxx/info-tip";
import { EmptyState } from "@/components/fyxx/empty-state";
import { MonthPicker } from "@/components/fyxx/date-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { fmtJOD, fmtPct, platformBg, type Platform, type PlatformKey } from "@/lib/fyxx";
import { monthLabel, type RangeKey } from "@/lib/months";
import { useRangeFilter } from "@/hooks/use-range-filter";
import { Segmented } from "../dashboard";

export const Route = createFileRoute("/_authenticated/financials")({
  head: () => ({ meta: [{ title: "Financials · TGR" }] }),
  component: Financials,
});

export function Financials() {
  // Same shared source as the Overview and the report. Every figure below renders moneyTrail's
  // output: this page does not compute its own gross, COGS, VAT or margins.
  const fetchData = useServerFn(getDashboardData);
  const { data } = useQuery({ queryKey: ["dashboard"], queryFn: () => fetchData(), refetchOnWindowFocus: false });

  const [platformFilter, setPlatformFilter] = useState<PlatformKey>("All");
  const allRows = useMemo(() => data?.financials ?? [], [data]);

  const allMonths = useMemo(
    () => Array.from(new Set(allRows.map((r) => r.month))).sort(),
    [allRows],
  );
  const today = useMemo(() => {
    const last = allMonths.at(-1);
    return last ? `${last}-28` : new Date().toISOString().slice(0, 10);
  }, [allMonths]);

  const { range, setRange, customFrom, customTo, handleCustomFrom, handleCustomTo, rangeMonths, rangeLabel } =
    useRangeFilter({ allMonths, today });

  // Newest month first, one row per (month, platform), respecting the platform filter.
  const rows = allRows
    .filter((r) => (platformFilter === "All" || r.platform === platformFilter) && rangeMonths.includes(r.month))
    .sort((a, b) => (a.month === b.month ? a.platform.localeCompare(b.platform) : b.month.localeCompare(a.month)));
  const plats = (platformFilter === "All" ? ["Talabat", "Careem"] : [platformFilter]) as Platform[];

  // Per-row figures: each row is one (month, platform) slice of the shared money trail.
  const rowData = rows.map((r) => {
    const t = moneyTrail(data!, [r.month], [r.platform as Platform]);
    const fee = t.grossExVat > 0 ? (t.grossExVat - t.payoutExVat) / t.grossExVat : 0;
    return {
      r, gross: t.gross, payout: t.payout, discount: t.discounts, netSales: t.netSales,
      cogs: t.cogs, fee, profit: t.netProfit, margin: t.netMargin,
    };
  });

  // TOTALS: the range trail for the selected platforms (fee % and margin % blended from the sums).
  const tt = moneyTrail(data ?? { financials: [], itemSales: [], costs: [], daily: [], itemAliases: {} }, rangeMonths, plats);
  const totals = { gross: tt.gross, discount: tt.discounts, netSales: tt.netSales, payout: tt.payout, cogs: tt.cogs, profit: tt.netProfit };
  const totalFee = tt.grossExVat > 0 ? (tt.grossExVat - tt.payoutExVat) / tt.grossExVat : 0;
  const totalMargin = tt.netMargin;
  const totalNetSalesExVat = tt.netSalesExVat;

  // Client-side CSV of exactly the rows/totals shown, for the active range + platform filters.
  // JOD to 3 decimals (fils), percentages as displayed, ISO month. No figure is recomputed.
  function exportCsv() {
    const jod = (n: number) => n.toFixed(3);
    const headers = [
      "Month", "Platform", "Gross (incl VAT)", "Discount", "Net sales",
      "Actual payout", "Platform fee %", "COGS", "Net profit", "Net margin",
    ];
    const body = rowData.map((d) => [
      d.r.month, d.r.platform, jod(d.gross), jod(d.discount), jod(d.netSales),
      jod(d.payout), fmtPct(d.fee), jod(d.cogs), jod(d.profit), fmtPct(d.margin),
    ]);
    const totalsRow = [
      "TOTALS", "", jod(totals.gross), jod(totals.discount), jod(totals.netSales),
      jod(totals.payout), fmtPct(totalFee), jod(totals.cogs), jod(totals.profit), fmtPct(totalMargin),
    ];
    const csv = [headers, ...body, totalsRow].map((row) => row.map(csvCell).join(",")).join("\r\n");

    const short = (m: string) => monthLabel(m).toLowerCase().replace(/\s+/g, "");
    const first = rangeMonths[0];
    const last = rangeMonths[rangeMonths.length - 1];
    const rangeToken = first === last ? short(first) : `${short(first)}-${short(last)}`;
    const platToken = platformFilter === "All" ? "" : `-${platformFilter.toLowerCase()}`;
    const filename = `fyxx-financials${platToken}-${rangeToken}.csv`;

    const blob = new Blob([BOM + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Monthly financials"
        description="Gross sales, actual payouts and COGS per platform. COGS and net margin are ex-VAT (matching the Overview)."
      />
      <div className="flex flex-wrap gap-3 items-center mb-4">
        <Segmented
          options={[
            { v: "this", l: "This Month" },
            { v: "last", l: "Last Month" },
            { v: "ytd", l: "YTD" },
            { v: "custom", l: "Custom" },
            { v: "all", l: "All-Time" },
          ]}
          value={range}
          onChange={(v) => setRange(v as RangeKey)}
        />
        {range === "custom" && (
          <div className="flex gap-2 items-center bg-card border border-border rounded-full px-3 py-1 text-xs">
            <label className="text-muted-foreground">From</label>
            <div className="w-36"><MonthPicker value={customFrom} onChange={handleCustomFrom} /></div>
            <label className="text-muted-foreground">To</label>
            <div className="w-36"><MonthPicker value={customTo} onChange={handleCustomTo} min={customFrom} /></div>
          </div>
        )}
        <Segmented
          platform
          options={[
            { v: "All", l: "All" },
            { v: "Talabat", l: "Talabat" },
            { v: "Careem", l: "Careem" },
          ]}
          value={platformFilter}
          onChange={(v) => setPlatformFilter(v as PlatformKey)}
        />
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          onClick={exportCsv}
          disabled={rows.length === 0}
        >
          <Download className="size-3.5 mr-1.5" /> Export CSV
        </Button>
      </div>

      {rows.length === 0 ? (
        <EmptyState label={rangeLabel} />
      ) : (
        <Card className="p-0 overflow-hidden overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead>Platform</TableHead>
                <TableHead className="text-right"><span className="inline-flex items-center">Gross (incl. VAT)<InfoTip id="sales_incl_vat" side="bottom" /></span></TableHead>
                <TableHead className="text-right"><span className="inline-flex items-center">Discount<InfoTip id="discount" side="bottom" /></span></TableHead>
                <TableHead className="text-right"><span className="inline-flex items-center">Net sales<InfoTip id="net_sales" side="bottom" /></span></TableHead>
                <TableHead className="text-right"><span className="inline-flex items-center">Actual payout<InfoTip id="actual_payout" side="bottom" /></span></TableHead>
                <TableHead className="text-right"><span className="inline-flex items-center">Platform fee %<InfoTip id="platform_fee_pct" side="bottom" /></span></TableHead>
                <TableHead className="text-right"><span className="inline-flex items-center">COGS<InfoTip id="total_cogs" side="bottom" /></span></TableHead>
                <TableHead className="text-right"><span className="inline-flex items-center">Net profit<InfoTip id="net_profit_kept" side="bottom" /></span></TableHead>
                <TableHead className="text-right"><span className="inline-flex items-center">Net margin<InfoTip id="net_margin" side="bottom" /></span></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rowData.map((d) => {
                const r = d.r;
                return (
                  <TableRow key={`${r.month}-${r.platform}`}>
                    <TableCell className="font-medium">{r.month}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={platformBg(r.platform as Platform)}>
                        {r.platform}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-num">{fmtJOD(d.gross)}</TableCell>
                    <TableCell className="text-right text-num text-muted-foreground">
                      {fmtJOD(d.discount)}
                    </TableCell>
                    <TableCell className="text-right text-num">{fmtJOD(d.netSales)}</TableCell>
                    <TableCell className="text-right text-num">
                      <span className="inline-flex items-center justify-end gap-1">
                        {fmtJOD(d.payout)}
                        {(d.payout <= 0 || d.fee >= 0.95) && (
                          <AnomalyNote gross={d.gross} discount={d.discount} payout={d.payout} cogs={d.cogs} />
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-num">{fmtPct(d.fee)}</TableCell>
                    <TableCell className="text-right text-num text-muted-foreground">
                      {fmtJOD(d.cogs)}
                    </TableCell>
                    <TableCell
                      className={`text-right text-num font-semibold ${d.profit >= 0 ? "text-success" : "text-destructive"}`}
                    >
                      {fmtJOD(d.profit)}
                    </TableCell>
                    <TableCell
                      className={`text-right text-num ${d.margin >= 0 ? "text-success" : "text-destructive"}`}
                    >
                      {fmtPct(d.margin)}
                    </TableCell>
                  </TableRow>
                );
              })}

              {/* TOTALS — summed across the filtered rows; %s blended from the sums. */}
              <TableRow className="border-t-2 border-border bg-muted/40 font-semibold hover:bg-muted/40">
                <TableCell colSpan={2} className="font-semibold">TOTALS</TableCell>
                <TableCell className="text-right text-num">{fmtJOD(totals.gross)}</TableCell>
                <TableCell className="text-right text-num">{fmtJOD(totals.discount)}</TableCell>
                <TableCell className="text-right text-num">
                  <div>{fmtJOD(totals.netSales)}</div>
                  <div className="text-[10px] font-normal text-muted-foreground">
                    ex-VAT {fmtJOD(totalNetSalesExVat)}
                  </div>
                </TableCell>
                <TableCell className="text-right text-num">{fmtJOD(totals.payout)}</TableCell>
                <TableCell className="text-right text-num">{fmtPct(totalFee)}</TableCell>
                <TableCell className="text-right text-num">{fmtJOD(totals.cogs)}</TableCell>
                <TableCell
                  className={`text-right text-num ${totals.profit >= 0 ? "text-success" : "text-destructive"}`}
                >
                  {fmtJOD(totals.profit)}
                </TableCell>
                <TableCell
                  className={`text-right text-num ${totalMargin >= 0 ? "text-success" : "text-destructive"}`}
                >
                  {fmtPct(totalMargin)}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

/** UTF-8 byte-order mark so Excel opens the CSV as UTF-8. */
const BOM = "﻿";

/** Quote a CSV cell when it contains a comma, quote or newline (RFC 4180). */
function csvCell(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function AnomalyNote({ gross, discount, payout, cogs }: { gross: number; discount: number; payout: number; cogs: number }) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelClose = () => { if (timer.current) clearTimeout(timer.current); };
  const scheduleClose = () => { timer.current = setTimeout(() => setOpen(false), 120); };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center justify-center text-amber-500 hover:text-amber-600 rounded-full focus:outline-none"
          aria-label="Payout anomaly explanation"
          onMouseEnter={() => { cancelClose(); setOpen(true); }}
          onMouseLeave={scheduleClose}
        >
          <span className="text-[12px] leading-none select-none">⚠</span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="left"
        sideOffset={6}
        className="w-[300px] p-3 text-[12px] leading-relaxed z-[200]"
        onMouseEnter={cancelClose}
        onMouseLeave={scheduleClose}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <p className="font-semibold text-[13px] mb-1.5 text-amber-600">Payout wiped out this month.</p>
        <p className="text-muted-foreground">
          Gross was <span className="text-foreground font-medium">{fmtJOD(gross)}</span>, but after
          partner-funded promos (<span className="text-foreground font-medium">{fmtJOD(discount)}</span>),
          the platform's commission & fees, and platform <strong>adjustments</strong> (e.g. a
          clawback/correction settled this month), the actual payout was{" "}
          <span className="text-foreground font-medium">{fmtJOD(payout)}</span>. You still paid{" "}
          <span className="text-foreground font-medium">{fmtJOD(cogs)}</span> in food cost, so net
          profit (= ex-VAT payout − COGS) is negative even though sales looked healthy. This is real
          settlement data, not an error. The detail is in the platform's invoice/adjustments.
        </p>
      </PopoverContent>
    </Popover>
  );
}
