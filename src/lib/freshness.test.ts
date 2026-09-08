import { describe, it, expect } from "vitest";
import { latestCoverageDate } from "./freshness";

describe("latestCoverageDate: honest imported-sales coverage, limited by the slower platform", () => {
  it("takes the newest date per platform, then the earlier of the two", () => {
    const rows = [
      { platform: "Talabat", lastDate: "2026-09-06" },
      { platform: "Talabat", lastDate: "2026-08-31" }, // older month, ignored in favour of the newest
      { platform: "Careem", lastDate: "2026-09-04" }, // Careem is the laggard
    ];
    expect(latestCoverageDate(rows)).toBe("2026-09-04");
  });

  it("is not fooled by a later date on only one platform", () => {
    const rows = [
      { platform: "Talabat", lastDate: "2026-09-30" }, // would be a wrong future claim on its own
      { platform: "Careem", lastDate: "2026-09-05" },
    ];
    expect(latestCoverageDate(rows)).toBe("2026-09-05");
  });

  it("returns the single platform's date when only one has orders", () => {
    expect(latestCoverageDate([{ platform: "Talabat", lastDate: "2026-09-06" }])).toBe("2026-09-06");
  });

  it("returns null when there is no order data at all", () => {
    expect(latestCoverageDate([])).toBeNull();
    expect(latestCoverageDate([{ platform: "Talabat", lastDate: null }])).toBeNull();
  });
});
