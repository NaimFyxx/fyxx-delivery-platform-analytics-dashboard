import { useState, useMemo } from "react";
import { monthOfDate, prevMonth, monthsBetween, type RangeKey } from "@/lib/months";

export function useRangeFilter({ allMonths, today }: { allMonths: string[]; today: string }) {
  // "This / Last Month" resolve off the REAL calendar month, independent of what data exists,
  // so importing a new month never leaves "Last Month" pointing at an empty month.
  const calendarMonth = monthOfDate(new Date().toISOString().slice(0, 10));
  // Custom-range defaults still track the data-derived month (the latest imported month).
  const dataMonth = monthOfDate(today);
  const [range, setRange] = useState<RangeKey>("this");
  const [customFrom, setCustomFrom] = useState(dataMonth);
  const [customTo, setCustomTo] = useState(dataMonth);

  const handleCustomFrom = (v: string) => {
    setCustomFrom(v);
    if (v > customTo) setCustomTo(v);
  };
  const handleCustomTo = (v: string) => {
    setCustomTo(v);
    if (v < customFrom) setCustomFrom(v);
  };

  const rangeMonths: string[] = useMemo(() => {
    if (!allMonths.length) return [];
    if (range === "this") return [calendarMonth];
    if (range === "last") return [prevMonth(calendarMonth)];
    if (range === "custom") {
      const lo = customFrom <= customTo ? customFrom : customTo;
      const hi = customFrom <= customTo ? customTo : customFrom;
      return monthsBetween(lo, hi);
    }
    return allMonths;
  }, [range, calendarMonth, customFrom, customTo, allMonths]);

  const rangeIsSingleMonth = rangeMonths.length === 1;

  return { range, setRange, customFrom, customTo, handleCustomFrom, handleCustomTo, rangeMonths, rangeIsSingleMonth };
}
