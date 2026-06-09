import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/fyxx/page-header";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { fmtJOD, fmtPct, exVat, platformBg, type Platform } from "@/lib/fyxx";

export const Route = createFileRoute("/_authenticated/financials")({
  head: () => ({ meta: [{ title: "Financials · TGR" }] }),
  component: Financials,
});

function Financials() {
  const { data: rows = [] } = useQuery({
    queryKey: ["monthly_financials"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("monthly_financials")
        .select("*")
        .order("month", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader title="Monthly financials" description="Gross sales, actual payouts and COGS per platform. Net margin uses ex-VAT sales." />
      <Card className="p-0 overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Month</TableHead>
              <TableHead>Platform</TableHead>
              <TableHead className="text-right">Gross (incl. VAT)</TableHead>
              <TableHead className="text-right">Net (ex-VAT)</TableHead>
              <TableHead className="text-right">Actual payout</TableHead>
              <TableHead className="text-right">Platform fee %</TableHead>
              <TableHead className="text-right">COGS</TableHead>
              <TableHead className="text-right">Gross profit</TableHead>
              <TableHead className="text-right">Margin</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-12">No monthly financials yet. Add some on the Data entry page.</TableCell></TableRow>
            )}
            {rows.map((r) => {
              const gross = Number(r.gross_sales);
              const payout = Number(r.actual_payout);
              const cogs = Number(r.cogs);
              const net = exVat(gross);
              const fee = net > 0 ? (net - payout) / net : 0;
              const profit = payout - cogs;
              const margin = payout > 0 ? profit / payout : 0;
              return (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.month}</TableCell>
                  <TableCell><Badge variant="outline" className={platformBg(r.platform as Platform)}>{r.platform}</Badge></TableCell>
                  <TableCell className="text-right text-num">{fmtJOD(gross)}</TableCell>
                  <TableCell className="text-right text-num text-muted-foreground">{fmtJOD(net)}</TableCell>
                  <TableCell className="text-right text-num">{fmtJOD(payout)}</TableCell>
                  <TableCell className="text-right text-num">{fmtPct(fee)}</TableCell>
                  <TableCell className="text-right text-num text-muted-foreground">{fmtJOD(cogs)}</TableCell>
                  <TableCell className={`text-right text-num font-semibold ${profit >= 0 ? "text-success" : "text-destructive"}`}>{fmtJOD(profit)}</TableCell>
                  <TableCell className={`text-right text-num ${margin >= 0 ? "text-success" : "text-destructive"}`}>{fmtPct(margin)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}