/**
 * Pace badge state: the combined figure against the combined base and (optional) stretch targets.
 * Pure and stateless. Permanence of the reached states is inherent, not tracked here: cumulative
 * sales cannot fall, so once totalSales >= base the month reads "Target reached" on any later day, and
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
  // User-facing labels only. The state keys (base_reached / stretch_reached) and the DB columns stay;
  // "base" reads as "Target" and "stretch" as "Moonshot" everywhere they are shown.
  base_reached: "Target reached",
  stretch_reached: "Moonshot reached",
  missed: "Target missed",
};

/**
 * The celebration treatment when a Target or Moonshot is reached: a gold outline on the card and a
 * solid gold chip. Deliberately restrained (no animation, banner or tint). Moonshot uses the deeper
 * gold so it outranks an ordinary Target. Centralised here so the level is easy to raise later: add a
 * card tint or a banner in one place and both the desktop and mobile pace cards pick it up.
 */
export interface Celebration {
  chipBg: string; // solid gold fill for the chip
  chipText: string; // dark ink on the gold
  cardOutline: string; // box-shadow value for the card
}
export function celebrationFor(badge: PaceBadgeState): Celebration | null {
  if (badge === "stretch_reached") return { chipBg: "var(--warning)", chipText: "var(--accent-foreground)", cardOutline: "inset 0 0 0 2px var(--accent)" };
  if (badge === "base_reached") return { chipBg: "var(--accent)", chipText: "var(--accent-foreground)", cardOutline: "inset 0 0 0 2px var(--accent)" };
  return null;
}
