import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getDashboardData } from "@/lib/dashboard.functions";
import { loadDbAliases } from "@/lib/aliases";
import { exportReportPdf } from "@/lib/report";
import { Button } from "@/components/ui/button";
import { FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";

/** One-click executive PDF. Self-contained: it pulls the same dashboard data (shared react-query
 *  cache) and aliases the pages already use, so the report matches Financials + Items regardless
 *  of which page hosts the button. No filters, no inputs. */
export function ExportReportButton({
  variant = "outline",
  size = "sm",
  className,
}: {
  variant?: React.ComponentProps<typeof Button>["variant"];
  size?: React.ComponentProps<typeof Button>["size"];
  className?: string;
}) {
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
  const [busy, setBusy] = useState(false);

  async function onClick() {
    if (!data) return;
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      const preparedBy = (u.user?.user_metadata?.display_name as string) || u.user?.email || "";
      const res = exportReportPdf(data, dbAliases, preparedBy);
      if (!res.ok) toast.error(res.error ?? "Could not generate the report");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant={variant} size={size} className={className} onClick={onClick} disabled={isLoading || !data || busy}>
      {busy ? <Loader2 className="size-3.5 mr-1.5 animate-spin" /> : <FileText className="size-3.5 mr-1.5" />}
      Export report (PDF)
    </Button>
  );
}
