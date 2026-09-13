/**
 * Best-ever records: the single place that knows, per metric, which direction counts as better and
 * how to read that metric off the money trail. Direction is a property of the METRIC declared once
 * here, never decided per chart, so a cost metric can never be congratulated for going up.
 *
 * Every figure is read straight from a per-month MoneyTrail (moneyTrailPerMonth). Nothing is
 * recomputed: discountShare and netMargin are ratios of trail fields, the same way the trail itself
 * derives netMargin. The scan is pure and takes the health "is this month clean" predicate as an
 * argument, so records defer to the health panel (rule 4) without this module importing it.
 */
import type { MoneyTrail } from "./money-trail";

export type Direction = "higher" | "lower";

export interface MetricDef {
  key: string;
  /** Human label, e.g. "Monthly gross". Used in the "beats <month> at <value>" wording. */
  label: string;
  /** Unit suffix for wording: "JOD", "%", or "" for a bare count. */
  unit: string;
  /** Declared ONCE, here. Higher-is-better vs lower-is-better. Charts/KPIs read this, never set it. */
  direction: Direction;
  /**
   * A ratio/margin metric (net margin, discount share). Its record needs a volume floor so a tiny
   * month cannot post a flukey extreme (rule 3): eligible months must also clear RATIO_MIN_ORDERS.
   */
  ratioFloor: boolean;
  /** Reads the metric's value from a single month's trail. Ratios are returned as percentages. */
  value: (m: MoneyTrail) => number;
}

/**
 * Launch-artefact floor (rule 1): a month with fewer than 5 orders never holds a record, matching the
 * exact guard the 3-month sales floor already applies (October 2025 was 3 orders, 33.25 JOD).
 */
export const LAUNCH_MIN_ORDERS = 5;
/**
 * Ratio volume floor (rule 3): margin and share records additionally require at least this many
 * orders. This is the same minimum the COGS-band health check (check 2) uses, COGS_MIN_ORDERS = 10,
 * so a month like March 2026 (51.5% net margin on 657 JOD) never surfaces on thin volume.
 */
export const RATIO_MIN_ORDERS = 10;

export const METRICS = {
  gross: {
    key: "gross",
    label: "Monthly gross",
    unit: "JOD",
    direction: "higher",
    ratioFloor: false,
    value: (m) => m.gross,
  },
  netProfit: {
    key: "netProfit",
    label: "Net profit kept",
    unit: "JOD",
    direction: "higher",
    ratioFloor: false,
    value: (m) => m.netProfit,
  },
  orders: {
    key: "orders",
    label: "Monthly orders",
    unit: "",
    direction: "higher",
    ratioFloor: false,
    value: (m) => m.orders,
  },
  netMargin: {
    key: "netMargin",
    label: "Net margin",
    unit: "%",
    direction: "higher",
    ratioFloor: true,
    value: (m) => m.netMargin * 100,
  },
  discountShare: {
    key: "discountShare",
    label: "Discounting",
    unit: "%",
    direction: "lower",
    ratioFloor: true,
    // The trail's `discounts` over `gross`. Lower is better: a record here is the least discounting.
    value: (m) => (m.gross > 0 ? (m.discounts / m.gross) * 100 : 0),
  },
} satisfies Record<string, MetricDef>;

export type MetricKey = keyof typeof METRICS;

/** One month of history to scan: its month key ("YYYY-MM") and that month's trail. */
export interface MonthPoint {
  month: string;
  trail: MoneyTrail;
}

export interface BestEver {
  metricKey: string;
  /** The record-holding month ("YYYY-MM"), or null when no month is eligible. */
  recordMonth: string | null;
  recordValue: number | null;
  /** The runner-up: what the record beats, so a claim always names a real prior best. */
  beatsMonth: string | null;
  beatsValue: number | null;
  eligibleMonths: number;
}

export interface RecordOpts {
  /** The in-progress month ("YYYY-MM"); it can never hold a record (rule 2). */
  currentMonth: string;
  /** True when a month's health status is "pass" (rule 4). A flagged month is never eligible. */
  isClean: (month: string) => boolean;
}

/** Is `a` better than `b` for this metric's direction? */
export function isBetter(direction: Direction, a: number, b: number): boolean {
  return direction === "higher" ? a > b : a < b;
}

function eligiblePoints(metric: MetricDef, points: MonthPoint[], opts: RecordOpts): MonthPoint[] {
  return points.filter((p) => {
    if (p.month === opts.currentMonth) return false; // rule 2: partial month cannot hold
    if (p.trail.orders < LAUNCH_MIN_ORDERS) return false; // rule 1: launch artefact
    if (metric.ratioFloor && p.trail.orders < RATIO_MIN_ORDERS) return false; // rule 3: ratio volume floor
    if (!opts.isClean(p.month)) return false; // rule 4: defer to the health panel
    return true;
  });
}

/**
 * The best-ever record for a metric across history, after every exclusion. Returns the holder and the
 * runner-up it beats. When nothing is eligible, all fields are null.
 */
export function bestEver(metric: MetricDef, points: MonthPoint[], opts: RecordOpts): BestEver {
  const ranked = eligiblePoints(metric, points, opts)
    .map((p) => ({ month: p.month, v: metric.value(p.trail) }))
    .sort((x, y) => (isBetter(metric.direction, x.v, y.v) ? -1 : isBetter(metric.direction, y.v, x.v) ? 1 : 0));

  if (ranked.length === 0) {
    return { metricKey: metric.key, recordMonth: null, recordValue: null, beatsMonth: null, beatsValue: null, eligibleMonths: 0 };
  }
  const rec = ranked[0];
  const runnerUp = ranked[1] ?? null;
  return {
    metricKey: metric.key,
    recordMonth: rec.month,
    recordValue: rec.v,
    beatsMonth: runnerUp?.month ?? null,
    beatsValue: runnerUp?.v ?? null,
    eligibleMonths: ranked.length,
  };
}

export type RecordState = "record" | "on-track" | "none" | "suppressed";

export interface SelectedOpts extends RecordOpts {
  /** The month the KPI / current view represents ("YYYY-MM"). */
  selectedMonth: string;
  /** True when the selected month is still in progress. */
  selectedIsPartial: boolean;
  /**
   * Projected month-end value for the selected partial month, for the "on track" claim. Supply only
   * for volume metrics that extrapolate honestly (a projected ratio is not honest, so leave it null
   * for ratio metrics and they simply show the reference line while partial).
   */
  projectedValue?: number | null;
}

/**
 * The indicator state for the selected month: whether it holds the record, is on track to beat it, is
 * just context (reference line), or is suppressed because the month is health-flagged.
 */
export function recordStateFor(metric: MetricDef, points: MonthPoint[], opts: SelectedOpts): { state: RecordState; best: BestEver } {
  const best = bestEver(metric, points, opts);

  if (!opts.isClean(opts.selectedMonth)) return { state: "suppressed", best }; // rule 4

  if (opts.selectedIsPartial) {
    if (best.recordValue != null && opts.projectedValue != null && isBetter(metric.direction, opts.projectedValue, best.recordValue)) {
      return { state: "on-track", best };
    }
    return { state: "none", best };
  }

  if (best.recordMonth === opts.selectedMonth) return { state: "record", best };
  return { state: "none", best };
}
