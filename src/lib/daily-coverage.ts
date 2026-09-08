/**
 * Shared coverage trim for every writer of daily_sales.
 *
 * Several importers write a daily_sales row per date across the range they were handed, including
 * dates with no sales:
 *   - the Talabat daily recompute seeds every calendar day of each imported month to zero (to clear
 *     stale days), so a full-month Order Report writes rows for days that have not happened yet;
 *   - the Careem daily recompute seeds each order date to zero (past dates only);
 *   - the Careem Plus import writes a row per day of a full calendar month at zero sales.
 * A row with a real date but no sales pushes max(daily_sales.date) to month end, which is what
 * corrupted the freshness label, the avg-per-day KPIs and the current-month chart.
 *
 * Rather than have every reader of daily_sales guard against these rows, we trim at each writer:
 * keep only dates on or before the platform's latest order date, so daily_sales never claims
 * coverage past the imported sales (the same coverage logic the header uses). Trimming a future day
 * only drops a would-be write; it never deletes existing rows, and it never touches a past day, so
 * the recompute's legitimate clear-to-zero of a day that lost its orders still happens.
 *
 * The one case to protect is a writer being handed only dates after the latest order date (the Plus
 * file imported BEFORE the order data for that month, so the latest order date is in an earlier
 * period). A blind trim would drop the whole legitimate import, so we keep everything and signal
 * importedFirst; coverage aligns on the next import once the order data is in.
 */
export function trimDatesToCoverage(
  dates: string[],
  lastOrderDate: string | null,
): { keep: string[]; trimmed: string[]; importedFirst: boolean } {
  const sorted = [...dates].sort();
  const keep = lastOrderDate ? sorted.filter((d) => d <= lastOrderDate) : [];
  if (keep.length === 0) {
    // No order data yet, or every date is after it: trimming would drop a legitimate import. Keep all.
    return { keep: sorted, trimmed: [], importedFirst: true };
  }
  return { keep, trimmed: sorted.filter((d) => d > lastOrderDate!), importedFirst: false };
}
