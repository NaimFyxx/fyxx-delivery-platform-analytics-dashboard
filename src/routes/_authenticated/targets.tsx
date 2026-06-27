import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/fyxx/page-header";
import { InfoTip } from "@/components/fyxx/info-tip";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Check, Loader2, Pencil, X } from "lucide-react";
import { fmtJOD, fmtPct, platformBg, PLATFORMS, type Platform } from "@/lib/fyxx";

export const Route = createFileRoute("/_authenticated/targets")({
  head: () => ({ meta: [{ title: "Targets · TGR" }] }),
  component: TargetsPage,
});

const MONTH_NAMES_LONG = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];
function fmtMonthLong(m: string) {
  const [y, mo] = m.split("-").map(Number);
  return `${MONTH_NAMES_LONG[mo - 1]} ${y}`;
}

function TargetsPage() {
  const [editKey, setEditKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const qc = useQueryClient();

  // All targets across all months
  const { data: targets = [] } = useQuery({
    queryKey: ["targets_all"],
    queryFn: async () => {
      const { data, error } = await supabase.from("targets").select("*").order("month", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const targetMonths = useMemo(
    () => Array.from(new Set(targets.map((t) => t.month))).sort().reverse(),
    [targets],
  );

  // Earliest month with a target, for the daily_sales span query
  const earliest = useMemo(() => [...targetMonths].sort()[0] ?? null, [targetMonths]);

  // Daily sales across the full span — proper date bounds (next-month exclusive)
  const { data: sales = [] } = useQuery({
    queryKey: ["daily_sales_span", earliest],
    queryFn: async () => {
      if (!earliest) return [];
      const start = `${earliest}-01`;
      const today = new Date().toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from("daily_sales").select("*").gte("date", start).lte("date", today);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!earliest,
  });

  // "YYYY-MM|Platform" → gross sales
  const salesMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of sales) {
      const key = `${r.date.slice(0, 7)}|${r.platform}`;
      map.set(key, (map.get(key) ?? 0) + Number(r.sales_jod));
    }
    return map;
  }, [sales]);

  // Upsert a target — same mutation the Data entry Targets tab uses
  const saveMut = useMutation({
    mutationFn: async ({ month, platform, value }: { month: string; platform: Platform; value: number }) => {
      const { error } = await supabase.from("targets").upsert(
        { month, platform, sales_target_jod: value },
        { onConflict: "month,platform" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Target saved");
      setEditKey(null);
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  function startEdit(month: string, platform: string, current: number) {
    setEditKey(`${month}|${platform}`);
    setEditValue(current > 0 ? String(current) : "");
  }

  function cancelEdit() {
    setEditKey(null);
    setEditValue("");
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <PageHeader title="Targets vs actuals" description="Monthly sales targets per platform, from the first month targets were set." />

      {targetMonths.length === 0 && (
        <p className="text-sm text-muted-foreground mt-4">No targets set yet. Add them on the Data entry page.</p>
      )}

      {targetMonths.map((month) => (
        <div key={month} className="mb-8">
          <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">
            {fmtMonthLong(month)}
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {PLATFORMS.map((p) => {
              const t = targets.find((x) => x.month === month && x.platform === p);
              const actual = salesMap.get(`${month}|${p}`) ?? 0;
              const targetVal = Number(t?.sales_target_jod ?? 0);
              const pct = targetVal > 0 ? Math.min(actual / targetVal, 1) : 0;
              const key = `${month}|${p}`;
              const isEditing = editKey === key;
              const previewTarget = Number(editValue);
              const previewPct = previewTarget > 0 ? Math.min(actual / previewTarget, 1) : 0;

              return (
                <Card key={p} className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-display text-xl font-semibold">{p}</h3>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={platformBg(p)}>{month}</Badge>
                      {!isEditing && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                          onClick={() => startEdit(month, p, targetVal)}
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {isEditing ? (
                    <div className="space-y-4">
                      <div>
                        <Label className="text-xs mb-1.5 block">Sales target (JOD)</Label>
                        <div className="flex gap-2">
                          <Input
                            type="number"
                            step="0.001"
                            min="0"
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            // eslint-disable-next-line jsx-a11y/no-autofocus
                            autoFocus
                            className="h-8 text-sm"
                          />
                          <Button
                            size="sm"
                            className="h-8 px-3"
                            disabled={saveMut.isPending || !editValue}
                            onClick={() => saveMut.mutate({ month, platform: p as Platform, value: previewTarget })}
                          >
                            {saveMut.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                          </Button>
                          <Button size="sm" variant="ghost" className="h-8 px-3" onClick={cancelEdit}>
                            <X className="size-3.5" />
                          </Button>
                        </div>
                      </div>
                      {previewTarget > 0 && (
                        <Row
                          label="Sales (gross)"
                          actual={fmtJOD(actual)}
                          target={fmtJOD(previewTarget)}
                          pct={previewPct}
                          infoId="sales_incl_vat"
                        />
                      )}
                    </div>
                  ) : !t ? (
                    <p className="text-sm text-muted-foreground">No target set. Add one on the Data entry page.</p>
                  ) : (
                    <div className="space-y-5">
                      <Row label="Sales (gross)" actual={fmtJOD(actual)} target={fmtJOD(targetVal)} pct={pct} infoId="sales_incl_vat" />
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function Row({ label, actual, target, pct, infoId }: { label: string; actual: string; target: string; pct: number; infoId?: string }) {
  return (
    <div>
      <div className="flex items-end justify-between mb-2 text-sm">
        <span className="text-muted-foreground flex items-center">{label}{infoId && <InfoTip id={infoId} side="top" />}</span>
        <span className="text-num">
          <span className="font-semibold">{actual}</span>{" "}
          <span className="text-muted-foreground">/ {target}</span>
        </span>
      </div>
      <Progress value={pct * 100} className="h-3" />
      <div className="mt-1 text-xs text-muted-foreground text-right text-num">{fmtPct(pct)}</div>
    </div>
  );
}
