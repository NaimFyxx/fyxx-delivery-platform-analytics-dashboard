/**
 * Freshness helpers for the header "Data current as of" label.
 *
 * The honest coverage date is the latest date the IMPORTED SALES actually reach, limited by the
 * slower platform. It is sourced from platform_orders (via lastOrderDates in the DTO), the raw
 * per-order data, so it is not polluted by the zero-sales daily_sales rows the Careem Plus import
 * writes for a full calendar month (which pushed max(daily_sales.date) to month end and made the old
 * label read a future date). Per platform we take the newest order date, then the EARLIER of the
 * platforms, so the label never claims currency past whichever platform is behind. Read-only.
 */
export function latestCoverageDate(
  lastOrderDates: { platform: string; lastDate: string | null }[],
): string | null {
  const newestPerPlatform = new Map<string, string>();
  for (const r of lastOrderDates) {
    if (!r.lastDate) continue;
    const cur = newestPerPlatform.get(r.platform);
    if (!cur || r.lastDate > cur) newestPerPlatform.set(r.platform, r.lastDate);
  }
  const dates = [...newestPerPlatform.values()];
  if (!dates.length) return null;
  // Earlier of the platforms: coverage is honestly limited by the platform that is behind.
  return dates.reduce((earliest, d) => (d < earliest ? d : earliest));
}
