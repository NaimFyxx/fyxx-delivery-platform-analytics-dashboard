import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getDashboardData } from "@/lib/dashboard.functions";
import { PageHeader } from "@/components/fyxx/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowDownRight, ArrowUpRight, Check, Loader2, PartyPopper, Pencil, X } from "lucide-react";
import { fmtJOD, fmtPct, PLATFORMS, type Platform } from "@/lib/fyxx";
import { computePace, lastDayOfMonth, monthOfDate } from "../dashboard";

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
const platformColor = (p: Platform) => (p === "Careem" ? "var(--careem)" : "var(--talabat)");

type Tone = "win" | "onpace" | "close" | "behind" | "below";
type Status = {
  badge: { label: string; tone: Tone; celebrate?: boolean };
  arrow: { up: boolean; pct: number; ref: string };
} | null;

// Decide the badge + over/under arrow for a month.
// Completed months get a final verdict; the in-progress month is judged on pace (no harsh "missed").
function buildStatus(inProgress: boolean, actual: number, target: number, proRated: number): Status {
  if (target <= 0) return null;
  if (inProgress) {
    const delta = proRated > 0 ? (actual - proRated) / proRated : 0;
    return {
      badge: actual >= proRated ? { label: "On pace", tone: "onpace" } : { label: "Behind pace", tone: "behind" },
      arrow: { up: delta >= 0, pct: Math.abs(delta) * 100, ref: "vs pace" },
    };
  }
  const ach = actual / target;
  const over = ach - 1;
  const badge =
    ach >= 1 ? { label: "Target hit", tone: "win" as Tone, celebrate: true }
    : ach >= 0.9 ? { label: "So close", tone: "close" as Tone }
    : { label: "Below target", tone: "below" as Tone };
  return { badge, arrow: { up: over >= 0, pct: Math.abs(over) * 100, ref: "vs target" } };
}

const TONE_CLS: Record<Tone, string> = {
  win:    "bg-success/10 text-success border-success/40",
  onpace: "bg-success/10 text-success border-success/40",
  close:  "bg-amber-500/10 text-amber-600 border-amber-500/40",
  behind: "bg-amber-500/10 text-amber-600 border-amber-500/40",
  below:  "bg-muted text-muted-foreground border-border",
};

function StatusBadge({ s }: { s: NonNullable<Status>["badge"] }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${TONE_CLS[s.tone]}`}>
      {s.celebrate && <PartyPopper className="size-3.5" />}
      {s.label}
    </span>
  );
}

function DeltaArrow({ a }: { a: NonNullable<Status>["arrow"] }) {
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-semibold ${a.up ? "text-success" : "text-destructive"}`}>
      {a.up ? <ArrowUpRight className="size-3.5" /> : <ArrowDownRight className="size-3.5" />}
      {a.pct.toFixed(0)}% {a.up ? "over" : "under"} <span className="text-muted-foreground font-normal">{a.ref}</span>
    </span>
  );
}

function TargetsPage() {
  const [editKey, setEditKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const qc = useQueryClient();

  // Actuals come from computePace over pace_daily (the corrected gross numbers), the same source
  // as the pace tracker — so Targets only populates once daily sales are entered, not from imports.
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

      <div className="space-y-4">
        {data &&
          targetMonths.map((month) => {
            const inProgress = month === calendarMonth;
            // Same numbers the pace tracker shows: gross actuals from pace_daily, prorated to today.
            const pace = computePace(data, month, inProgress ? realToday : lastDayOfMonth(month));

            const cActual = pace.totalSales;
            const cTarget = pace.totalTarget;
            const status = buildStatus(inProgress, cActual, cTarget, pace.proRated);
            const combinedPct = cTarget > 0 ? cActual / cTarget : 0;

            // Stacked bar segments. The bar fills to combined/target (capped at 100%),
            // then splits proportionally to each platform's actual sales — so the bigger
            // seller always shows the longer segment, even past 100% of target.
            const careemActual = pace.rows.find((r) => r.platform === "Careem")?.sales ?? 0;
            const fill = cTarget > 0 ? Math.min(cActual / cTarget, 1) : 0;
            const careemShare = cActual > 0 ? careemActual / cActual : 0;
            const careemW = fill * careemShare * 100;
            const talabatW = fill * (1 - careemShare) * 100;

            return (
              <Card key={month} className="p-5">
                <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
                  <div className="flex items-center gap-3">
                    <h2 className="font-display text-lg font-semibold">{fmtMonthLong(month)}</h2>
                    {inProgress && (
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground border border-border rounded-full px-2 py-0.5">
                        Day {pace.dayOfMonth}/{pace.daysInMonth}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {status && <DeltaArrow a={status.arrow} />}
                    {status && <StatusBadge s={status.badge} />}
                  </div>
                </div>

                {/* Combined stacked pace bar */}
                <div className="h-3 w-full rounded-full bg-muted overflow-hidden flex mb-2">
                  <div style={{ width: `${careemW}%`, background: "var(--careem)" }} />
                  <div style={{ width: `${talabatW}%`, background: "var(--talabat)" }} />
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground mb-4">
                  <span className="text-num">
                    Combined <span className="font-semibold text-foreground">{fmtJOD(cActual)}</span> / {fmtJOD(cTarget)}
                  </span>
                  <span className="text-num font-semibold" style={{ color: combinedPct >= 1 ? "var(--careem)" : undefined }}>
                    {cTarget > 0 ? fmtPct(combinedPct) : "—"}
                  </span>
                </div>

                {/* Per-platform rows (with inline edit) */}
                <div className="space-y-2 pt-3 border-t border-border">
                  {PLATFORMS.map((p) => {
                    const t = targets.find((x) => x.month === month && x.platform === p);
                    const actual = pace.rows.find((r) => r.platform === p)?.sales ?? 0;
                    const targetVal = Number(t?.salesTarget ?? 0);
                    const pct = targetVal > 0 ? actual / targetVal : 0;
                    const key = `${month}|${p}`;
                    const isEditing = editKey === key;

                    return (
                      <div key={p} className="flex items-center gap-2 text-sm min-h-8">
                        <span className="size-2 rounded-full shrink-0" style={{ background: platformColor(p) }} />
                        <span className="font-medium w-16 shrink-0">{p}</span>
                        {isEditing ? (
                          <div className="flex gap-2 items-center flex-1">
                            <Label className="sr-only">Sales target (JOD)</Label>
                            <Input
                              type="number" step="0.001" min="0" value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              // eslint-disable-next-line jsx-a11y/no-autofocus
                              autoFocus className="h-8 text-sm max-w-40"
                              placeholder="Sales target (JOD)"
                            />
                            <Button size="sm" className="h-8 px-3" disabled={saveMut.isPending || !editValue}
                              onClick={() => saveMut.mutate({ month, platform: p as Platform, value: Number(editValue) })}>
                              {saveMut.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                            </Button>
                            <Button size="sm" variant="ghost" className="h-8 px-3" onClick={cancelEdit}>
                              <X className="size-3.5" />
                            </Button>
                          </div>
                        ) : t ? (
                          <>
                            <span className="text-num ml-auto">
                              <span className="font-semibold">{fmtJOD(actual)}</span>{" "}
                              <span className="text-muted-foreground">/ {fmtJOD(targetVal)}</span>
                            </span>
                            <span className="text-num text-xs text-muted-foreground w-12 text-right">{fmtPct(pct)}</span>
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                              onClick={() => startEdit(month, p, targetVal)}>
                              <Pencil className="size-3.5" />
                            </Button>
                          </>
                        ) : (
                          <span className="ml-auto text-xs text-muted-foreground">
                            No target ·{" "}
                            <button className="underline hover:text-foreground" onClick={() => startEdit(month, p, 0)}>set one</button>
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </Card>
            );
          })}
      </div>
    </div>
  );
}
