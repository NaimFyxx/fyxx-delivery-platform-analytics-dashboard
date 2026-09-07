import { useMemo } from "react";
import { useSearch, useNavigate } from "@tanstack/react-router";
import { monthOfDate, prevMonth, monthsBetween, type RangeKey } from "@/lib/months";
import type { PlatformKey } from "@/lib/fyxx";
import type { FilterSearch } from "@/lib/filter-search";

/** Human, prose month label for the empty-state message, e.g. "July 2026". */
const fullMonthLabel = (m: string) =>
  new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

/**
 * Range and platform filters, backed by the URL search params so they persist across navigation,
 * back/forward and sharing. Absent params fall back to the smart default range (this / last / all by
 * what data exists) and All platforms, so nothing changes until the user picks a filter; once picked
 * it lives in the URL. Writes go through the router; the smart default is never written to the URL.
 */
export function useRangeFilter({ allMonths, today }: { allMonths: string[]; today: string }) {
  const search = useSearch({ strict: false }) as FilterSearch;
  const navigate = useNavigate();

  // "This / Last Month" resolve off the REAL calendar month, independent of what data exists.
  const calendarMonth = monthOfDate(new Date().toISOString().slice(0, 10));
  const dataMonth = monthOfDate(today);

  // Smart default when the URL carries no range: current month has data -> this; else last -> last;
  // else all. Computed, not stored, so it never fights a manual selection.
  const smartDefault: RangeKey = allMonths.includes(calendarMonth)
    ? "this"
    : allMonths.includes(prevMonth(calendarMonth))
      ? "last"
      : "all";

  const range: RangeKey = search.range ?? smartDefault;
  const customFrom = search.from ?? dataMonth;
  const customTo = search.to ?? dataMonth;
  const platform: PlatformKey = search.platform ?? "All";

  const patch = (p: Partial<FilterSearch>) =>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- loose search across routes
    navigate({ to: ".", search: (prev: any) => ({ ...prev, ...p }), replace: true });

  const setRange = (r: RangeKey) =>
    patch(r === "custom" ? { range: "custom", from: customFrom, to: customTo } : { range: r, from: undefined, to: undefined });
  const handleCustomFrom = (v: string) => patch({ range: "custom", from: v, to: v > customTo ? v : customTo });
  const handleCustomTo = (v: string) => patch({ range: "custom", from: v < customFrom ? v : customFrom, to: v });
  // Platform "All" is the default, so it is left out of the URL to keep the link clean.
  const setPlatform = (p: PlatformKey) => patch({ platform: p === "All" ? undefined : p });

  const rangeMonths: string[] = useMemo(() => {
    if (!allMonths.length) return [];
    if (range === "this") return [calendarMonth];
    if (range === "last") return [prevMonth(calendarMonth)];
    if (range === "ytd") {
      const ytdStart = `${calendarMonth.slice(0, 4)}-01`;
      return allMonths.filter((m) => m >= ytdStart && m <= calendarMonth);
    }
    if (range === "custom") {
      const lo = customFrom <= customTo ? customFrom : customTo;
      const hi = customFrom <= customTo ? customTo : customFrom;
      return monthsBetween(lo, hi);
    }
    return allMonths;
  }, [range, calendarMonth, customFrom, customTo, allMonths]);

  const rangeIsSingleMonth = rangeMonths.length === 1;

  const rangeLabel = useMemo(() => {
    if (range === "this") return "this month";
    if (range === "last") return "last month";
    if (range === "ytd") return "year to date";
    if (range === "all") return "all time";
    const lo = customFrom <= customTo ? customFrom : customTo;
    const hi = customFrom <= customTo ? customTo : customFrom;
    return lo === hi ? fullMonthLabel(lo) : `${fullMonthLabel(lo)} to ${fullMonthLabel(hi)}`;
  }, [range, customFrom, customTo]);

  return {
    range,
    setRange,
    customFrom,
    customTo,
    handleCustomFrom,
    handleCustomTo,
    rangeMonths,
    rangeIsSingleMonth,
    rangeLabel,
    platform,
    setPlatform,
  };
}
