import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/fyxx/page-header";
import { InfoTip } from "@/components/fyxx/info-tip";
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
  const allRows = data?.financials ?? [];
  const rows = platformFilter === "All" ? allRows : allRows.filter((r) => r.platform === platformFilter);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Monthly financials"
        description="Gross sales, actual payouts and COGS per platform. COGS and net margin are ex-VAT (matching the Overview)."
      />
      <div className="mb-4">
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
      <Card className="p-0 overflow-hidden">
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
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-sm text-muted-foreground py-12">
                  No monthly financials yet. Import an Order Report / Order Level, or add some on
                  the Data entry page.
                </TableCell>
              </TableRow>
            )}
            {rows.map((r) => {
              const gross = Number(r.gross_sales);
              const payout = Number(r.actual_payout);
              // Partner-funded discount + recognised sales bridge (menu gross − discount).
              const discount = Number(r.discount ?? 0);
              const netSales = gross - discount;
              // COGS the Overview way: live from item sales × versioned costs (ex-VAT).
              const cogs = cogsFor(data?.itemSales ?? [], data?.costs ?? [], r.month, [r.platform], dbAliases);
              const net = exVat(gross);
              const payoutExVat = exVat(payout);
              // Margins are ex-VAT throughout (cost is ex-VAT; payout/gross are stripped).
              const fee = net > 0 ? (net - payoutExVat) / net : 0;
              const profit = payoutExVat - cogs;
              const margin = payoutExVat > 0 ? profit / payoutExVat : 0;
              return (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.month}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={platformBg(r.platform as Platform)}>
                      {r.platform}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-num">{fmtJOD(gross)}</TableCell>
                  <TableCell className="text-right text-num text-muted-foreground">
                    {fmtJOD(discount)}
                  </TableCell>
                  <TableCell className="text-right text-num">{fmtJOD(netSales)}</TableCell>
                  <TableCell className="text-right text-num">
                    <span className="inline-flex items-center justify-end gap-1">
                      {fmtJOD(payout)}
                      {(payout <= 0 || fee >= 0.95) && (
                        <AnomalyNote gross={gross} discount={discount} payout={payout} cogs={cogs} />
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="text-right text-num">{fmtPct(fee)}</TableCell>
                  <TableCell className="text-right text-num text-muted-foreground">
                    {fmtJOD(cogs)}
                  </TableCell>
                  <TableCell
                    className={`text-right text-num font-semibold ${profit >= 0 ? "text-success" : "text-destructive"}`}
                  >
                    {fmtJOD(profit)}
                  </TableCell>
                  <TableCell
                    className={`text-right text-num ${margin >= 0 ? "text-success" : "text-destructive"}`}
                  >
                    {fmtPct(margin)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
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
