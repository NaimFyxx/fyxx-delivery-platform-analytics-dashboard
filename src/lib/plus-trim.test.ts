import { describe, it, expect } from "vitest";
import { trimPlusDatesToCoverage } from "./plus-trim";

const sep = (d: number) => `2026-09-${String(d).padStart(2, "0")}`;
const fullMonth = Array.from({ length: 30 }, (_, i) => sep(i + 1));

describe("trimPlusDatesToCoverage: Plus coverage never runs past the imported sales", () => {
  it("drops the days after the last order date (the normal, mid-month case)", () => {
    const { keep, trimmed, importedFirst } = trimPlusDatesToCoverage(fullMonth, sep(8));
    expect(keep).toEqual(fullMonth.slice(0, 8)); // 1..8
    expect(trimmed).toEqual(fullMonth.slice(8)); // 9..30
    expect(trimmed.length).toBe(22);
    expect(importedFirst).toBe(false);
  });

  it("keeps everything and flags importedFirst when Plus is imported before the order data", () => {
    // Latest order date is in the prior month, so every September row is after it.
    const { keep, trimmed, importedFirst } = trimPlusDatesToCoverage(fullMonth, "2026-08-31");
    expect(keep).toEqual(fullMonth);
    expect(trimmed).toEqual([]);
    expect(importedFirst).toBe(true);
  });

  it("keeps everything and flags importedFirst when there is no order data at all", () => {
    const { keep, trimmed, importedFirst } = trimPlusDatesToCoverage(fullMonth, null);
    expect(keep).toEqual(fullMonth);
    expect(trimmed).toEqual([]);
    expect(importedFirst).toBe(true);
  });

  it("trims nothing when orders already cover the whole file", () => {
    const { keep, trimmed, importedFirst } = trimPlusDatesToCoverage(fullMonth.slice(0, 6), sep(9));
    expect(keep).toEqual(fullMonth.slice(0, 6));
    expect(trimmed).toEqual([]);
    expect(importedFirst).toBe(false);
  });
});
