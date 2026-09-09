import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getDashboardData } from "@/lib/dashboard.functions";
import { latestCoverageDate, freshnessLabel } from "@/lib/freshness";

/**
 * The freshness line: a pulsing dot plus the coverage statement. Fetches the same public dashboard
 * data the Overview/Insights Header uses (react-query dedupes the ["dashboard"] key across pages) and
 * runs it through the same latestCoverageDate + freshnessLabel, so every page, guest or admin, shows
 * the same statement in the same words. Read-only.
 */
export function FreshnessLabel({ className = "" }: { className?: string }) {
  const fetchData = useServerFn(getDashboardData);
  const { data } = useQuery({ queryKey: ["dashboard"], queryFn: () => fetchData(), refetchOnWindowFocus: false });
  const coverageDate = data ? latestCoverageDate(data.lastOrderDates) : null;
  const fresh = freshnessLabel(coverageDate, new Date().toISOString().slice(0, 10));
  return (
    <div className={`flex items-center gap-1 text-[11px] ${className}`}>
      <span className="inline-block w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: fresh.color }} />
      <span style={{ color: fresh.color }}>{fresh.text}</span>
    </div>
  );
}
