/**
 * Import-time trim for the Careem Plus daily rows.
 *
 * The Careem Plus export is a full calendar month (Lori's instructions say so), so it carries rows
 * for days that have not happened yet, at zero. Those rows land in daily_sales with a real date but
 * no sales, which pushed max(daily_sales.date) to month end and made the freshness label read a
 * future date. Rather than have every reader of daily_sales guard against them, we trim at the
 * source: keep only rows on or before the platform's latest order date, so the Plus data never
 * claims coverage past the imported sales (the same coverage logic the header now uses).
 *
 * The one case to protect is Lori importing Plus BEFORE the order data for that month. Then the
 * latest order date is in an earlier period and every Plus row is after it, so a blind trim would
 * wipe the whole legitimate import. In that case we keep everything and signal importedFirst, so the
 * caller can note it; coverage aligns on the next Plus import once the order data is in.
 */
export function trimPlusDatesToCoverage(
  dates: string[],
  lastOrderDate: string | null,
): { keep: string[]; trimmed: string[]; importedFirst: boolean } {
  const sorted = [...dates].sort();
  const keep = lastOrderDate ? sorted.filter((d) => d <= lastOrderDate) : [];
  if (keep.length === 0) {
    // No order data yet, or every row is after it: trimming would drop a legitimate import. Keep all.
    return { keep: sorted, trimmed: [], importedFirst: true };
  }
  return { keep, trimmed: sorted.filter((d) => d > lastOrderDate!), importedFirst: false };
}
