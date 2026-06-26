import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/fyxx/page-header";
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
import { fmtJOD, fmtPct, exVat, platformBg, type Platform } from "@/lib/fyxx";
import { cogsFor } from "@/lib/costs";

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

  const [platformFilter, setPlatformFilter] = useState<"All" | Platform>("All");
  const allRows = data?.financials ?? [];
  const rows = platformFilter === "All" ? allRows : allRows.filter((r) => r.platform === platformFilter);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader
        title="Monthly financials"
        description="Gross sales, actual payouts and COGS per platform. COGS and net margin are ex-VAT (matching the Overview)."
      />
      <div className="flex gap-1.5 mb-4">
        {(["All", "Talabat", "Careem"] as const).map((p) => (
          <Button
            key={p}
            size="sm"
            variant={platformFilter === p ? "default" : "outline"}
            onClick={() => setPlatformFilter(p)}
            className="text-xs h-7 px-3"
          >
            {p}
          </Button>
        ))}
      </div>
      <Card className="p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Month</TableHead>
              <TableHead>Platform</TableHead>
              <TableHead className="text-right">Gross (incl. VAT)</TableHead>
              <TableHead className="text-right">Discount</TableHead>
              <TableHead className="text-right">Net sales</TableHead>
              <TableHead className="text-right">Actual payout</TableHead>
              <TableHead className="text-right">Platform fee %</TableHead>
              <TableHead className="text-right">COGS</TableHead>
              <TableHead className="text-right">Net profit</TableHead>
              <TableHead className="text-right">Net margin</TableHead>
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
              const cogs = cogsFor(data?.itemSales ?? [], data?.costs ?? [], r.month, [r.platform]);
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
                  <TableCell className="text-right text-num">{fmtJOD(payout)}</TableCell>
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
