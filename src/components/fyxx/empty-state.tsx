/** Friendly "nothing here for the selected range" card. Shown in place of the KPI/chart area
 *  when the current range resolves to no data — the header + filter bar stay visible so the
 *  user can switch periods. `label` is the selected range's prose label (e.g. "July 2026"). */
export function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-10 md:p-14 text-center">
      <h3 className="font-display text-lg font-semibold">No data for this period</h3>
      <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
        Nothing has been entered for {label} yet — check back later.
      </p>
    </div>
  );
}
