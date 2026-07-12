import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
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
import { fmtJOD, fmtPct, exVat, platformBg, type Platform, type PlatformKey } from "@/lib/fyxx";
import { type RangeKey } from "@/lib/months";
import { useRangeFilter } from "@/hooks/use-range-filter";
import { cogsFor } from "@/lib/costs";
import { loadDbAliases } from "@/lib/aliases";
import { Segmented } from "../dashboard";

export const Route = createFileRoute("/_authenticated/financials")({
  head: () => ({ meta: [{ title: "Financials · TGR" }] }),
  component: Financials,
});

function Financials() {
  const { data } = useQuery({
    queryKey: ["financials_page"],
    queryFn: async () => {
      // COGS is computed live from monthly_item_sales × versioned item_costs — the SAME
      // path as the Overview (cogsFor) — not the never-populated monthly_financials.cogs column.
      const [fin, items, costs] = await Promise.all([
        supabase.from("monthly_financials").select("*").order("month", { ascending: false }),
        supabase.from("monthly_item_sales").select("month,platform,item_name,units"),
        supabase.from("item_costs").select("item_name,cost_exvat,effective_from"),
      ]);
      if (fin.error) throw fin.error;
      return {
        financials: fin.data ?? [],
        itemSales: (items.data ?? []).map((r) => ({
          month: r.month,
          platform: r.platform as string,
          item: r.item_name,
          units: r.units,
        })),
        costs: (costs.data ?? []).map((r) => ({
          item: r.item_name,
          cost: Number(r.cost_exvat),
          effective_from: r.effective_from,
        })),
      };
    },
  });

  const { data: dbAliases = {} } = useQuery({
    queryKey: ["item_aliases"],
    queryFn: loadDbAliases,
    staleTime: 60_000,
  });

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

  const rows = allRows.filter(
    (r) => (platformFilter === "All" || r.platform === platformFilter) && rangeMonths.includes(r.month),
  );

  // Per-row figures (COGS the Overview way: live from item sales × versioned costs, ex-VAT).
  const rowData = rows.map((r) => {
    const gross = Number(r.gross_sales);
    const payout = Number(r.actual_payout);
    const discount = Number(r.discount ?? 0); // partner-funded promos (menu gross − discount = net)
    const netSales = gross - discount;
    const cogs = cogsFor(data?.itemSales ?? [], data?.costs ?? [], r.month, [r.platform], dbAliases);
    const net = exVat(gross);
    const payoutExVat = exVat(payout);
    // Margins are ex-VAT throughout (cost is ex-VAT; payout/gross are stripped).
    const fee = net > 0 ? (net - payoutExVat) / net : 0;
    const profit = payoutExVat - cogs;
    const margin = payoutExVat > 0 ? profit / payoutExVat : 0;
    return { r, gross, payout, discount, netSales, cogs, net, payoutExVat, fee, profit, margin };
  });

  // TOTALS over the currently-filtered rows. Fee % and margin % are blended from the summed
  // figures (not averaged). Net sales (ex-VAT) = net sales ÷ 1.16 (NSV is reported ex-VAT).
  const totals = rowData.reduce(
    (t, d) => ({
      gross: t.gross + d.gross,
      discount: t.discount + d.discount,
      netSales: t.netSales + d.netSales,
      payout: t.payout + d.payout,
      cogs: t.cogs + d.cogs,
      net: t.net + d.net,
      payoutExVat: t.payoutExVat + d.payoutExVat,
      profit: t.profit + d.profit,
    }),
    { gross: 0, discount: 0, netSales: 0, payout: 0, cogs: 0, net: 0, payoutExVat: 0, profit: 0 },
  );
  const totalFee = totals.net > 0 ? (totals.net - totals.payoutExVat) / totals.net : 0;
  const totalMargin = totals.payoutExVat > 0 ? totals.profit / totals.payoutExVat : 0;
  const totalNetSalesExVat = exVat(totals.netSales);

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
                  <TableRow key={r.id}>
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
          settlement data, not an error — the detail is in the platform's invoice/adjustments.
        </p>
      </PopoverContent>
    </Popover>
  );
}
