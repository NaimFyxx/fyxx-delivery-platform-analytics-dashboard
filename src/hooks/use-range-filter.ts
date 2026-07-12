import { useState, useMemo, useEffect, useRef } from "react";
import { monthOfDate, prevMonth, monthsBetween, type RangeKey } from "@/lib/months";

/** Human, prose month label for the empty-state message, e.g. "July 2026". */
const fullMonthLabel = (m: string) =>
  new Date(`${m}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

export function useRangeFilter({ allMonths, today }: { allMonths: string[]; today: string }) {
  // "This / Last Month" resolve off the REAL calendar month, independent of what data exists,
  // so importing a new month never leaves "Last Month" pointing at an empty month.
  const calendarMonth = monthOfDate(new Date().toISOString().slice(0, 10));
  // Custom-range defaults still track the data-derived month (the latest imported month).
  const dataMonth = monthOfDate(today);
  const [range, setRangeState] = useState<RangeKey>("this");
  const [customFrom, setCustomFrom] = useState(dataMonth);
  const [customTo, setCustomTo] = useState(dataMonth);

  // Smart initial default. allMonths is empty on first render and populates once data loads,
  // so settle the default once it's available — but only until the user picks a filter (the
  // `userTouched` guard), so this never fights a manual selection.
  //   current month has data  → "this"
  //   else last month has data → "last"
  //   else                     → "all"
  const userTouched = useRef(false);
  const settled = useRef(false);
  useEffect(() => {
    if (userTouched.current || settled.current || !allMonths.length) return;
    settled.current = true;
    if (allMonths.includes(calendarMonth)) setRangeState("this");
    else if (allMonths.includes(prevMonth(calendarMonth))) setRangeState("last");
    else setRangeState("all");
  }, [allMonths, calendarMonth]);

  const setRange = (r: RangeKey) => {
    userTouched.current = true;
    setRangeState(r);
  };
  const handleCustomFrom = (v: string) => {
    userTouched.current = true;
    setCustomFrom(v);
    if (v > customTo) setCustomTo(v);
  };
  const handleCustomTo = (v: string) => {
    userTouched.current = true;
    setCustomTo(v);
    if (v < customFrom) setCustomFrom(v);
  };

  const rangeMonths: string[] = useMemo(() => {
    if (!allMonths.length) return [];
    if (range === "this") return [calendarMonth];
    if (range === "last") return [prevMonth(calendarMonth)];
    if (range === "ytd") {
      // Jan of the current calendar year up to and including the current month.
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

  // Prose label for the selected range (used by the "no data" empty state).
  const rangeLabel = useMemo(() => {
    if (range === "this") return "this month";
    if (range === "last") return "last month";
    if (range === "ytd") return "year to date";
    if (range === "all") return "all time";
    const lo = customFrom <= customTo ? customFrom : customTo;
    const hi = customFrom <= customTo ? customTo : customFrom;
    return lo === hi ? fullMonthLabel(lo) : `${fullMonthLabel(lo)} – ${fullMonthLabel(hi)}`;
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
  };
}
