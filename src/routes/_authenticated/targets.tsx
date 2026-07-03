import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getDashboardData } from "@/lib/dashboard.functions";
import { PageHeader } from "@/components/fyxx/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Check, Loader2, Pencil, X } from "lucide-react";
import { fmtJOD, PLATFORMS, type Platform } from "@/lib/fyxx";
import { PaceTracker, computePace, lastDayOfMonth, monthOfDate } from "../dashboard";

export const Route = createFileRoute("/_authenticated/targets")({
  head: () => ({ meta: [{ title: "Targets · TGR" }] }),
  component: TargetsPage,
});

const platformColor = (p: Platform) => (p === "Careem" ? "var(--careem)" : "var(--talabat)");

function TargetsPage() {
  const [editKey, setEditKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const qc = useQueryClient();

  const fetchData = useServerFn(getDashboardData);
  const { data } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => fetchData(),
    refetchOnWindowFocus: false,
  });

  // "In-progress" = the real calendar month → judged on pace as of today; past months are final.
  const realToday = new Date().toISOString().slice(0, 10);
  const calendarMonth = monthOfDate(realToday);

  const targets = data?.targets ?? [];
  const targetMonths = useMemo(
    () => Array.from(new Set(targets.map((t) => t.month))).sort().reverse(),
    [targets],
  );

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
    <div className="p-6 max-w-3xl mx-auto">
      <PageHeader title="Targets vs actuals" description="Monthly pace per platform, from the pace tracker's daily sales. Completed months show the final result; the current month is judged on pace." />

      {(!data || targetMonths.length === 0) && (
        <p className="text-sm text-muted-foreground mt-4">
          {!data ? "Loading…" : "No targets set yet. Add them on the Data entry page."}
        </p>
      )}

      {data &&
        targetMonths.map((month) => {
          const pace = computePace(
            data,
            month,
            month === calendarMonth ? realToday : lastDayOfMonth(month),
          );
          return (
            <PaceTracker
              key={month}
              pace={pace}
              currentMonth={month}
              footer={
                <div className="space-y-1.5">
                  {PLATFORMS.map((p) => {
                    const t = targets.find((x) => x.month === month && x.platform === p);
                    const targetVal = Number(t?.salesTarget ?? 0);
                    const key = `${month}|${p}`;
                    const isEditing = editKey === key;
                    return (
                      <div key={p} className="flex items-center gap-2 text-xs min-h-7">
                        <span className="size-2 rounded-full shrink-0" style={{ background: platformColor(p) }} />
                        <span className="font-medium w-16 shrink-0">{p}</span>
                        {isEditing ? (
                          <div className="flex gap-2 items-center flex-1">
                            <Label className="sr-only">Sales target (JOD)</Label>
                            <Input
                              type="number" step="0.001" min="0" value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              // eslint-disable-next-line jsx-a11y/no-autofocus
                              autoFocus className="h-7 text-xs max-w-36"
                              placeholder="Sales target (JOD)"
                            />
                            <Button size="sm" className="h-7 px-2.5" disabled={saveMut.isPending || !editValue}
                              onClick={() => saveMut.mutate({ month, platform: p as Platform, value: Number(editValue) })}>
                              {saveMut.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 px-2.5" onClick={cancelEdit}>
                              <X className="size-3.5" />
                            </Button>
                          </div>
                        ) : t ? (
                          <>
                            <span className="text-muted-foreground ml-auto">Target</span>
                            <span className="text-num font-semibold">{fmtJOD(targetVal)}</span>
                            <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                              onClick={() => startEdit(month, p, targetVal)}>
                              <Pencil className="size-3.5" />
                            </Button>
                          </>
                        ) : (
                          <span className="ml-auto text-muted-foreground">
                            No target ·{" "}
                            <button className="underline hover:text-foreground" onClick={() => startEdit(month, p, 0)}>set one</button>
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              }
            />
          );
        })}
    </div>
  );
}
