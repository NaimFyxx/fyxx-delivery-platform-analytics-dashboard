/**
 * The range and platform filters live in the URL search params so they persist across navigation,
 * support back/forward, and produce shareable links (useful for the read-only link). Long, readable
 * keys and values on purpose: ?range=custom&from=2026-01&to=2026-08&platform=Talabat.
 * Absent params fall back to the smart default range and All platforms, so nothing changes until the
 * user picks a filter. Invalid values are dropped rather than throwing.
 */
import { retainSearchParams } from "@tanstack/react-router";
import type { RangeKey } from "./months";
import type { PlatformKey } from "./fyxx";

export interface FilterSearch {
  range?: RangeKey;
  from?: string; // YYYY-MM, only meaningful when range === "custom"
  to?: string; // YYYY-MM
  platform?: PlatformKey;
}

const RANGES: readonly string[] = ["this", "last", "ytd", "custom", "all"];
const PLATFORMS: readonly string[] = ["All", "Talabat", "Careem"];
const MONTH_RE = /^\d{4}-\d{2}$/;

export function validateFilterSearch(input: Record<string, unknown>): FilterSearch {
  const out: FilterSearch = {};
  if (typeof input.range === "string" && RANGES.includes(input.range)) out.range = input.range as RangeKey;
  if (typeof input.platform === "string" && PLATFORMS.includes(input.platform)) out.platform = input.platform as PlatformKey;
  if (typeof input.from === "string" && MONTH_RE.test(input.from)) out.from = input.from;
  if (typeof input.to === "string" && MONTH_RE.test(input.to)) out.to = input.to;
  return out;
}

/** Route search middleware: carry the (validated) filter params across navigation between the
 *  analytics pages. `true` retains all params this route validates, which is exactly the filter set. */
export const retainFilterParams = retainSearchParams(true);
