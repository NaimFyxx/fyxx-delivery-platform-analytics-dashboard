import { useState, useMemo } from "react";
import { monthOfDate, prevMonth, monthsBetween, type RangeKey } from "@/lib/months";

export function useRangeFilter({ allMonths, today }: { allMonths: string[]; today: string }) {
  const currentMonth = monthOfDate(today);
  const [range, setRange] = useState<RangeKey>("this");
  const [customFrom, setCustomFrom] = useState(currentMonth);
  const [customTo, setCustomTo] = useState(currentMonth);

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
    if (range === "this") return [currentMonth];
    if (range === "last") return [prevMonth(currentMonth)];
    if (range === "custom") {
      const lo = customFrom <= customTo ? customFrom : customTo;
      const hi = customFrom <= customTo ? customTo : customFrom;
      return monthsBetween(lo, hi);
    }
    return allMonths;
  }, [range, currentMonth, customFrom, customTo, allMonths]);

  const rangeIsSingleMonth = rangeMonths.length === 1;

  return { range, setRange, customFrom, customTo, handleCustomFrom, handleCustomTo, rangeMonths, rangeIsSingleMonth };
}
