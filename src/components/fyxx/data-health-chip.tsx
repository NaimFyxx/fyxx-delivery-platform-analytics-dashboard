import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getDashboardData } from "@/lib/dashboard.functions";
import { loadDbAliases } from "@/lib/aliases";
import { runDataHealthChecks, type HealthStatus } from "@/lib/data-health";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const monthLong = (m: string) =>
  new Date(m + "-01T00:00:00").toLocaleString("en-US", { month: "long", year: "numeric" });

// pass = success green, warn = TGR yellow, fail = the existing destructive red (#c43d3d).
const STATUS_COLOR: Record<HealthStatus, string> = {
  pass: "var(--success)",
  warn: "#EEC36A",
  fail: "var(--destructive)",
};
function Dot({ s, className }: { s: HealthStatus; className?: string }) {
  return (
    <span
      className={`inline-block w-2 h-2 rounded-full shrink-0 ${className ?? ""}`}
      style={{ background: STATUS_COLOR[s] }}
    />
  );
}

function CheckRow({
  c,
}: {
  c: { label: string; scope?: string; status: HealthStatus; detail: string };
}) {
  return (
    <li className="flex items-start gap-2 text-[12px] leading-relaxed">
      <span className="mt-1.5">
        <Dot s={c.status} />
      </span>
      <span>
        <span className="font-medium">
          {c.label}
          {c.scope ? ` · ${c.scope}` : ""}:
        </span>{" "}
        <span className="text-muted-foreground">{c.detail}</span>
      </span>
    </li>
  );
}

function useHealthReport() {
  const fetchData = useServerFn(getDashboardData);
  const { data } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => fetchData(),
    refetchOnWindowFocus: false,
  });
  const { data: dbAliases = {} } = useQuery({
    queryKey: ["item_aliases"],
    queryFn: loadDbAliases,
    staleTime: 60_000,
  });
  return data ? runDataHealthChecks(data, dbAliases) : null;
}

const STATUS_WORD: Record<HealthStatus, string> = {
  pass: "All checks pass",
  warn: "Worth a look",
  fail: "Needs attention",
};

/** Inline health result for a single month. Used on the import page so the affected month's
 *  reconciliation appears right after an import completes (the shared ["dashboard"] query
 *  refetches on invalidation, so this updates on its own). */
export function DataHealthForMonth({ month }: { month: string }) {
  const report = useHealthReport();
  if (!report) return null;
  const mo = report.months.find((m) => m.month === month);
  if (!mo) {
    return (
      <div className="rounded-lg border border-border bg-muted/20 p-3 text-[12px] text-muted-foreground">
        Data health: no financial data yet for {monthLong(month)}. Checks run once this month has
        figures.
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center gap-2 mb-2">
        <Dot s={mo.status} />
        <span className="text-sm font-semibold">Data health · {monthLong(month)}</span>
        <span className="text-[11px] text-muted-foreground">{STATUS_WORD[mo.status]}</span>
      </div>
      <ul className="space-y-1.5">
        {mo.checks.map((c, i) => (
          <CheckRow key={i} c={c} />
        ))}
      </ul>
    </div>
  );
}

/** Admin-only data-health status chip + detail panel. Read-only; runs the checks over the same
 *  public dashboard data. Callers render it only for signed-in admins, never on the public link. */
export function DataHealthChip() {
  const [open, setOpen] = useState(false);
  const report = useHealthReport();
  if (!report) return null;

  const fails = report.months.filter((m) => m.status === "fail").length;
  const warns = report.months.filter((m) => m.status === "warn").length;
  const chipText =
    report.overall === "pass"
      ? "Data checks OK"
      : report.overall === "fail"
        ? `${fails} month${fails === 1 ? "" : "s"} failing`
        : `${warns} month${warns === 1 ? "" : "s"} to review`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Data health self-check"
        className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:bg-background/60 transition-colors whitespace-nowrap"
      >
        <Dot s={report.overall} /> {chipText}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Dot s={report.overall} /> Data health
            </DialogTitle>
            <DialogDescription>
              Read-only reconciliation of every month against the figures the dashboard already
              computes. Green passes, amber is worth a look, red is a failure. Order-date coverage
              checks gross and order data only, not item data.
            </DialogDescription>
          </DialogHeader>

          <div className="overflow-y-auto -mx-1 px-1 space-y-3">
            {report.months.map((mo) => (
              <div key={mo.month} className="rounded-lg border border-border p-3">
                <div className="flex items-center gap-2 mb-2">
                  <Dot s={mo.status} />
                  <span className="font-semibold text-sm">{monthLong(mo.month)}</span>
                  {!mo.complete && (
                    <span className="text-[10px] text-muted-foreground border border-border rounded-full px-1.5 py-0.5">
                      in progress
                    </span>
                  )}
                </div>
                <ul className="space-y-1.5">
                  {mo.checks.map((c, i) => (
                    <CheckRow key={i} c={c} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
