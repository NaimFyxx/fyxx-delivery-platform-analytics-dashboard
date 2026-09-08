import { describe, it, expect } from "vitest";
import { trimDatesToCoverage } from "./daily-coverage";

const sep = (d: number) => `2026-09-${String(d).padStart(2, "0")}`;
const fullMonth = Array.from({ length: 30 }, (_, i) => sep(i + 1));

describe("trimDatesToCoverage: daily_sales never claims coverage past the imported sales", () => {
  it("drops the days after the last order date (the full-month import, orders through the 8th)", () => {
    const { keep, trimmed, importedFirst } = trimDatesToCoverage(fullMonth, sep(8));
    expect(keep).toEqual(fullMonth.slice(0, 8)); // 1..8
    expect(trimmed).toEqual(fullMonth.slice(8)); // 9..30
    expect(trimmed.length).toBe(22);
    expect(importedFirst).toBe(false);
  });

  it("keeps everything and flags importedFirst when imported before the order data", () => {
    // Latest order date is in the prior month, so every date is after it.
    const { keep, trimmed, importedFirst } = trimDatesToCoverage(fullMonth, "2026-08-31");
    expect(keep).toEqual(fullMonth);
    expect(trimmed).toEqual([]);
    expect(importedFirst).toBe(true);
  });

  it("keeps everything and flags importedFirst when there is no order data at all", () => {
    const { keep, trimmed, importedFirst } = trimDatesToCoverage(fullMonth, null);
    expect(keep).toEqual(fullMonth);
    expect(trimmed).toEqual([]);
    expect(importedFirst).toBe(true);
  });

  it("trims nothing when orders already cover every date (past-only recompute)", () => {
    const { keep, trimmed, importedFirst } = trimDatesToCoverage(fullMonth.slice(0, 6), sep(9));
    expect(keep).toEqual(fullMonth.slice(0, 6));
    expect(trimmed).toEqual([]);
    expect(importedFirst).toBe(false);
  });
});
