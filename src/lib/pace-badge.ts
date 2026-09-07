/**
 * Pace badge state: the combined figure against the combined base and (optional) stretch targets.
 * Pure and stateless. Permanence of the reached states is inherent, not tracked here: cumulative
 * sales cannot fall, so once totalSales >= base the month reads "Base reached" on any later day, and
 * likewise for stretch. Read-only helper; it does not touch targets, sales, VAT or margins.
 */
export type PaceBadgeState = "no_target" | "in_progress" | "base_reached" | "stretch_reached" | "missed";

export interface PaceBadgeInput {
  totalSales: number; // cumulative combined sales for the month
  base: number; // combined base target (Talabat base + Careem base)
  stretch: number | null; // combined stretch target, or null when not set
  complete: boolean; // the month is over (dayOfMonth >= daysInMonth)
}

export function paceBadgeState(i: PaceBadgeInput): PaceBadgeState {
  if (i.base <= 0) return "no_target";
  if (i.stretch != null && i.stretch > 0 && i.totalSales >= i.stretch) return "stretch_reached";
  if (i.totalSales >= i.base) return "base_reached";
  if (i.complete) return "missed";
  return "in_progress";
}

/** Percentage of BASE (never stretch), for the headline figure and the pace comparison. */
export function paceBasePct(totalSales: number, base: number): number | null {
  return base > 0 ? (totalSales / base) * 100 : null;
}

/** Reached/missed label; null for in-progress and no-target, which show the pace figure instead. */
export const PACE_BADGE_LABEL: Record<PaceBadgeState, string | null> = {
  no_target: null,
  in_progress: null,
  base_reached: "Base reached",
  stretch_reached: "Stretch reached",
  missed: "Target missed",
};
