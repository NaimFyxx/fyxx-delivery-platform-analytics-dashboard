import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getDashboardData } from "@/lib/dashboard.functions";
import {
  Header, PaceTracker, Kpi,
  computePace, computeKpis, cogsFor,
  monthOfDate,
} from "./dashboard";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "The Green Room — Delivery Pace" },
      { name: "description", content: "Live pace and KPIs for The Green Room. Talabat & Careem." },
    ],
  }),
  component: PaceLandingPage,
});

function PaceLandingPage() {
  const fetchData = useServerFn(getDashboardData);
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => fetchData(),
    refetchOnWindowFocus: false,
  });

  const [showModal, setShowModal] = useState(false);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState(false);
  const nav = useNavigate();

  const today = useMemo(() => {
    const last = data?.daily.at(-1)?.date;
    return last ?? new Date().toISOString().slice(0, 10);
  }, [data]);
  const currentMonth = monthOfDate(today);
  const lastDailyDate = data?.daily.at(-1)?.date ?? null;

  const pace = useMemo(() => data ? computePace(data, currentMonth, today) : null, [data, currentMonth, today]);

  const totals = useMemo(() => {
    if (!data) return { gross: 0, payout: 0, cogs: 0, orders: 0 };
    const months = Array.from(new Set([
      ...data.financials.map((f) => f.month),
      ...data.daily.map((d) => d.date.slice(0, 7)),
    ]));
    return months.reduce((acc, m) => {
      const finRows = data.financials.filter((f) => f.month === m);
      const finGross = finRows.reduce((s, r) => s + r.gross, 0);
      const payout = finRows.reduce((s, r) => s + r.payout, 0);
      const dailyRows = data.daily.filter((d) => d.date.slice(0, 7) === m);
      const dailyGross = dailyRows.reduce((s, d) => s + d.sales, 0);
      const orders = dailyRows.reduce((s, d) => s + (d.orders ?? 0), 0);
      const gross = finGross > 0 ? finGross : dailyGross;
      const cogs = cogsFor(data.itemSales, data.costs, m, ["Talabat", "Careem"]);
      return { gross: acc.gross + gross, payout: acc.payout + payout, cogs: acc.cogs + cogs, orders: acc.orders + orders };
    }, { gross: 0, payout: 0, cogs: 0, orders: 0 });
  }, [data]);

  const kpis = computeKpis(totals);

  const activeDays = useMemo(() => {
    if (!data) return 1;
    return Math.max(1, new Set(data.daily.map((d) => d.date)).size);
  }, [data]);

  function handleViewDashboards() {
    if (localStorage.getItem("tgr_dash_unlock") === "1") {
      nav({ to: "/dashboard" });
    } else {
      setShowModal(true);
    }
  }

  function handleSubmitCode(e: React.FormEvent) {
    e.preventDefault();
    if (code === "12345") {
      localStorage.setItem("tgr_dash_unlock", "1");
      nav({ to: "/dashboard" });
    } else {
      setCodeError(true);
    }
  }

  function closeModal() {
    setShowModal(false);
    setCode("");
    setCodeError(false);
  }

  if (isLoading || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground">
        Loading...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header today={today} lastDailyDate={lastDailyDate} />
      <div className="px-4 md:px-7 pt-5 md:pt-7 pb-12 max-w-5xl mx-auto">
        <PaceTracker pace={pace} currentMonth={currentMonth} />
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5 mb-6">
          <Kpi
            label="Sales (incl VAT)"
            value={`${Math.round(kpis.gross).toLocaleString()}`}
            unit="JOD"
            delta={null}
            prior="all-time"
            sub={`avg ${Math.round(kpis.gross / activeDays).toLocaleString()} JOD/day`}
          />
          <Kpi
            label="Avg Basket (AOV)"
            value={kpis.aov ? kpis.aov.toFixed(2) : "—"}
            unit="JOD"
            delta={null}
            prior="sales ÷ orders"
            sub={`avg ${(kpis.orders / activeDays).toFixed(1)} orders/day`}
          />
          <Kpi
            label="Product Margin"
            value={kpis.prodMargin.toFixed(1)}
            unit="%"
            delta={null}
            prior="on menu price exVAT"
          />
          <Kpi
            label="Net Margin · after commission"
            value={kpis.netMargin.toFixed(1)}
            unit="%"
            delta={null}
            prior="on payout exVAT"
          />
          <Kpi
            label="Net Profit Kept"
            value={`${Math.round(kpis.netProfit).toLocaleString()}`}
            unit="JOD"
            delta={null}
            prior="payout exVAT − cost"
          />
        </div>

        <div className="flex flex-col items-center gap-3 pt-2">
          <button
            onClick={handleViewDashboards}
            className="px-6 py-3 rounded-full text-sm font-semibold bg-primary text-primary-foreground shadow-glow hover:opacity-90 transition-opacity"
          >
            View Dashboards →
          </button>
          <Link
            to="/auth"
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            Admin sign in
          </Link>
        </div>
      </div>

      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          onClick={closeModal}
        >
          <div
            className="bg-card border border-border rounded-2xl p-6 w-full max-w-sm mx-4 shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold mb-1">Access code</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Enter the access code to view the full dashboards.
            </p>
            <form onSubmit={handleSubmitCode} className="space-y-3">
              <input
                type="password"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  setCodeError(false);
                }}
                placeholder="Access code"
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              {codeError && (
                <p className="text-xs text-destructive font-medium">Incorrect code. Try again.</p>
              )}
              <button
                type="submit"
                className="w-full px-4 py-2 rounded-full text-sm font-semibold bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
              >
                Enter
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
