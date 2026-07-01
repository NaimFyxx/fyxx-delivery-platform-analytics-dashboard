import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { UNLOCK_KEY } from "@/hooks/use-soft-gate";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getDashboardData } from "@/lib/dashboard.functions";
import {
  Header, PaceTracker,
  computePace,
  monthOfDate,
  lastDayOfMonth,
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

  // Real calendar today (not data-derived) — a month only appears in history once it has ended.
  const calendarToday = new Date().toISOString().slice(0, 10);
  const calendarMonth = monthOfDate(calendarToday);
  const lastDailyDate = data?.daily.at(-1)?.date ?? null;

  const pace = useMemo(() => data ? computePace(data, calendarMonth, calendarToday) : null, [data, calendarMonth, calendarToday]);

  const completedMonths = useMemo(() => {
    if (!data) return [];
    const monthSet = new Set<string>();
    // Only months with a target set — pace history is actual-vs-target, so no target = nothing to show.
    data.targets.forEach((t) => monthSet.add(t.month));
    return Array.from(monthSet)
      .filter((m) => m < calendarMonth)
      .sort()
      .reverse()
      .slice(0, 12);
  }, [data, calendarMonth]);

  function handleViewDashboards() {
    if (localStorage.getItem(UNLOCK_KEY) === "1") {
      nav({ to: "/dashboard" });
    } else {
      setShowModal(true);
    }
  }

  function handleSubmitCode(e: React.FormEvent) {
    e.preventDefault();
    if (code === "12345") {
      localStorage.setItem(UNLOCK_KEY, "1");
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
      <Header today={today} lastDailyDate={lastDailyDate} showNav={false} />
      <div className="px-4 md:px-7 pt-5 md:pt-7 pb-12 max-w-5xl mx-auto">
        <PaceTracker pace={pace} currentMonth={calendarMonth} />

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

        <div className="mt-10">
          <div className="mb-4">
            <h2 className="text-base font-semibold">Pace History</h2>
            <p className="text-xs text-muted-foreground">Final pace for completed months.</p>
          </div>
          {completedMonths.length === 0 ? (
            <p className="text-sm text-muted-foreground">No completed months yet.</p>
          ) : (
            <div className="flex flex-col gap-4">
              {completedMonths.map((m) => (
                <PaceTracker
                  key={m}
                  pace={computePace(data, m, lastDayOfMonth(m))}
                  currentMonth={m}
                />
              ))}
            </div>
          )}
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
