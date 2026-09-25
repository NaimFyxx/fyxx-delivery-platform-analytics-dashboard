import { describe, it, expect } from "vitest";
import { buildZeroSalesRows } from "./items";
import type { CostRow, DbAliasMap } from "./costs";
import type { CategoryMap } from "./categories";

const BOTH = ["Talabat", "Careem"];
const noAliases: DbAliasMap = {};
const noCats: CategoryMap = {};

// Minimal catalogue: three items, two with prices, one cost-only.
const costRows: CostRow[] = [
  { item: "Smash Burger", cost: 3.18, effective_from: "2025-01-01" },
  { item: "G Cola (Sugar Free)", cost: 0.4, effective_from: "2025-01-01" },
  { item: "Naim Test Product", cost: 1.0, effective_from: "2025-01-01" },
];
const prices = [
  { item_name: "Smash Burger", platform: "Talabat", price_incl_vat: 10.0, effective_from: "2025-01-01" },
  { item_name: "Smash Burger", platform: "Careem", price_incl_vat: 10.5, effective_from: "2025-01-01" },
  { item_name: "G Cola (Sugar Free)", platform: "Talabat", price_incl_vat: 1.5, effective_from: "2025-01-01" },
  // Naim Test Product: cost-only, no price rows.
];

describe("buildZeroSalesRows", () => {
  it("lists only catalogue items absent from the present (sold) set", () => {
    // Smash Burger has sold; the other two never have.
    const present = new Set(["smash burger"]);
    const rows = buildZeroSalesRows({
      costRows,
      prices,
      catMap: noCats,
      dbAliases: noAliases,
      activePlatforms: BOTH,
      present,
      asOf: "2025-12-31",
    });
    expect(rows.map((r) => r.item).sort()).toEqual(["G Cola (Sugar Free)", "Naim Test Product"]);
  });

  it("returns every catalogue item when nothing has sold", () => {
    const rows = buildZeroSalesRows({
      costRows,
      prices,
      catMap: noCats,
      dbAliases: noAliases,
      activePlatforms: BOTH,
      present: new Set(),
      asOf: "2025-12-31",
    });
    expect(rows).toHaveLength(3);
  });

  it("returns nothing when every catalogue item has sold", () => {
    const present = new Set(["smash burger", "g cola (sugar free)", "naim test product"]);
    const rows = buildZeroSalesRows({
      costRows,
      prices,
      catMap: noCats,
      dbAliases: noAliases,
      activePlatforms: BOTH,
      present,
      asOf: "2025-12-31",
    });
    expect(rows).toHaveLength(0);
  });

  it("resolves the present set through the alias map (an item sold under an alias is not listed)", () => {
    // The catalogue spells it "G Cola (Sugar Free)"; sales came in as "Green Cola Sugar Free",
    // aliased to the canonical name. It has sold, so it must not appear.
    const dbAliases: DbAliasMap = { "green cola sugar free": "g cola (sugar free)" };
    const present = new Set(["g cola (sugar free)"]); // canonical of the aliased sale
    const rows = buildZeroSalesRows({
      costRows,
      prices,
      catMap: noCats,
      dbAliases,
      activePlatforms: BOTH,
      present,
      asOf: "2025-12-31",
    });
    expect(rows.map((r) => r.item)).not.toContain("G Cola (Sugar Free)");
  });

  it("carries cost, per-platform price and category, with no faked sales figures", () => {
    const catMap: CategoryMap = { "smash burger": "Sandos" };
    const rows = buildZeroSalesRows({
      costRows,
      prices,
      catMap,
      dbAliases: noAliases,
      activePlatforms: BOTH,
      present: new Set(),
      asOf: "2025-12-31",
    });
    const burger = rows.find((r) => r.item === "Smash Burger")!;
    expect(burger.category).toBe("Sandos");
    expect(burger.lastCost).toBe(3.18);
    expect(burger.listPrice.Talabat).toBe(10.0);
    expect(burger.listPrice.Careem).toBe(10.5);
    // Nothing sales-derived is invented.
    expect(burger.units).toBe(0);
    expect(burger.revenue).toBe(0);
    expect(burger.cogs).toBe(0);
    expect(burger.avgPrice).toBeNull();
    expect(burger.productMargin).toBeNull();
    expect(burger.netMargin).toBeNull();
    expect(burger.zeroSales).toBe(true);

    // Cost-only item still surfaces (catalogue = item_costs OR item_prices).
    const test = rows.find((r) => r.item === "Naim Test Product")!;
    expect(test.lastCost).toBe(1.0);
    expect(test.listPrice.Talabat).toBeNull();
    expect(test.listPrice.Careem).toBeNull();
  });

  it("hides a cost-only item when a single platform is filtered, but shows priced items on that platform", () => {
    const rows = buildZeroSalesRows({
      costRows,
      prices,
      catMap: noCats,
      dbAliases: noAliases,
      activePlatforms: ["Talabat"], // single platform
      present: new Set(),
      asOf: "2025-12-31",
    });
    const names = rows.map((r) => r.item);
    // Priced on Talabat -> shown; cost-only (no price rows) -> hidden unless both platforms active.
    expect(names).toContain("Smash Burger");
    expect(names).toContain("G Cola (Sugar Free)");
    expect(names).not.toContain("Naim Test Product");
  });
});
