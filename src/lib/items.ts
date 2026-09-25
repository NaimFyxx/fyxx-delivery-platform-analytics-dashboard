import { costAsOf, canonicalItemName, normalizeItemName, priceAsOf, type CostRow, type DbAliasMap } from "./costs";
import { categoryFor, type CategoryMap } from "./categories";
import { exVat } from "./fyxx";

export interface AggItem {
  item: string;
  platforms: Set<string>;
  units: number;
  revenue: number;
  cogs: number;
  lastCost: number | null;
  avgPrice: number | null;
  perPlatform: Record<string, { units: number; revenue: number }>;
  listPrice: Record<string, number | null>;
  productMargin: number | null;
  commMargin: number | null;
  netMargin: number | null;
}

export function aggregateItems(args: {
  itemSales: { month: string; platform: string; item: string; units: number; revenue: number }[];
  costs: CostRow[];
  prices: { item_name: string; platform: string; price_incl_vat: number; effective_from?: string }[];
  financials: { month: string; platform: string; gross: number; payout: number; discount: number }[];
  rangeMonths: string[];
  platforms: string[];
  dbAliases: DbAliasMap;
}): AggItem[] {
  const { itemSales, costs, prices, financials, rangeMonths, platforms, dbAliases } = args;
  const lastMonthEnd = rangeMonths.length ? `${rangeMonths[rangeMonths.length - 1]}-28` : "9999-12-31";

  type Row = {
    item: string;
    platforms: Set<string>;
    units: number;
    revenue: number;
    cogs: number;
    lastCost: number | null;
    perPlatform: Record<string, { units: number; revenue: number }>;
    netPayout: number;
    netProfit: number;
    commPayout: number;
  };

  const map = new Map<string, Row>();

  for (const s of itemSales) {
    if (!rangeMonths.includes(s.month)) continue;
    if (!platforms.includes(s.platform)) continue;

    const canonKey = canonicalItemName(s.item, dbAliases);
    if (!map.has(canonKey)) {
      map.set(canonKey, {
        item: s.item,
        platforms: new Set(),
        units: 0,
        revenue: 0,
        cogs: 0,
        lastCost: null,
        perPlatform: {},
        netPayout: 0,
        netProfit: 0,
        commPayout: 0,
      });
    }

    const row = map.get(canonKey)!;

    // Prefer the name whose normalizeItemName already equals the canonical (no alias lookup);
    // when tied, prefer shorter (drops "(12pcs)" etc.)
    const newIsDirect = normalizeItemName(s.item) === canonKey;
    const existingIsDirect = normalizeItemName(row.item) === canonKey;
    if (newIsDirect && !existingIsDirect) {
      row.item = s.item;
    } else if (!newIsDirect && !existingIsDirect && s.item.length < row.item.length) {
      row.item = s.item;
    }

    row.units += s.units;
    row.revenue += s.revenue;
    row.platforms.add(s.platform);

    if (!row.perPlatform[s.platform]) row.perPlatform[s.platform] = { units: 0, revenue: 0 };
    row.perPlatform[s.platform].units += s.units;
    row.perPlatform[s.platform].revenue += s.revenue;

    const asOf = `${s.month}-28`;
    const c = costAsOf(costs, canonicalItemName(s.item, dbAliases), asOf, dbAliases);
    const itemCogs = c != null ? s.units * c : 0;
    if (c != null) {
      row.cogs += itemCogs;
      row.lastCost = c;
    }

    const itemRevenue = s.revenue;
    const finRow = financials.find((f) => f.month === s.month && f.platform === s.platform);
    if (finRow && finRow.gross > 0 && itemRevenue > 0) {
      const share = itemRevenue / finRow.gross;
      const netPayoutItem = exVat(share * finRow.payout);
      row.netPayout += netPayoutItem;
      row.netProfit += netPayoutItem - itemCogs;
      row.commPayout += exVat(share * (finRow.payout + finRow.discount));
    }
  }

  const knownPlatforms = ["Talabat", "Careem"];
  return Array.from(map.values())
    .filter((r) => r.units > 0)
    .map((r) => ({
      item: r.item,
      platforms: r.platforms,
      units: r.units,
      revenue: r.revenue,
      cogs: r.cogs,
      lastCost: r.lastCost,
      avgPrice: r.units > 0 ? r.revenue / r.units : null,
      perPlatform: r.perPlatform,
      listPrice: Object.fromEntries(
        knownPlatforms.map((p) => [p, priceAsOf(prices, r.item, p, lastMonthEnd, dbAliases)]),
      ) as Record<string, number | null>,
      productMargin: r.revenue > 0 ? ((exVat(r.revenue) - r.cogs) / exVat(r.revenue)) * 100 : null,
      commMargin: r.commPayout > 0 ? ((r.commPayout - r.cogs) / r.commPayout) * 100 : null,
      netMargin: r.netPayout > 0 ? (r.netProfit / r.netPayout) * 100 : null,
    }));
}

/** An aggregated item plus its category and a zero-sales flag (the shape the Items table renders). */
export type ItemRow = AggItem & { category: string; zeroSales: boolean };

/**
 * Synthesize rows for catalogue items that have NO sales, given a `present` set of canonical names
 * to treat as already-sold. Pulls name, platforms, set prices and unit cost from item_costs /
 * item_prices / item_categories (the same tables the Add product form writes). All sales-derived
 * figures are left empty (0 units, null margins) so nothing is faked and nothing divides by zero.
 *
 * The single definition of "a catalogue item with no sales". The scope is the caller's: the Items
 * page passes a range-scoped `present` set ("no sales in the current view"); the Insights "Never
 * sold" block passes an all-time `present` set with both platforms active ("no sales, ever").
 */
export function buildZeroSalesRows(args: {
  costRows: CostRow[];
  prices: { item_name: string; platform: string; price_incl_vat: number; effective_from?: string }[];
  catMap: CategoryMap;
  dbAliases: DbAliasMap;
  activePlatforms: string[];
  present: Set<string>;
  asOf: string;
}): ItemRow[] {
  const { costRows, prices, catMap, dbAliases, activePlatforms, present, asOf } = args;

  // Pick one display name per canonical catalogue item, skipping any that already have sales.
  const names = new Map<string, string>();
  const consider = (name: string) => {
    const canon = canonicalItemName(name, dbAliases);
    if (present.has(canon)) return;
    const cur = names.get(canon);
    if (cur == null) { names.set(canon, name); return; }
    const curDirect = normalizeItemName(cur) === canon;
    const newDirect = normalizeItemName(name) === canon;
    if (newDirect && !curDirect) names.set(canon, name);
    else if (newDirect === curDirect && name.length < cur.length) names.set(canon, name);
  };
  for (const c of costRows) consider(c.item);
  for (const p of prices) consider(p.item_name);

  // Which platforms each catalogue item is listed on (from its price rows).
  const platformsByCanon = new Map<string, Set<string>>();
  for (const p of prices) {
    const canon = canonicalItemName(p.item_name, dbAliases);
    if (!platformsByCanon.has(canon)) platformsByCanon.set(canon, new Set());
    platformsByCanon.get(canon)!.add(p.platform);
  }

  const rows: ItemRow[] = [];
  for (const [canon, name] of names) {
    const listed = Array.from(platformsByCanon.get(canon) ?? []);
    // Respect the platform filter: show if listed on an active platform; a cost-only item
    // (no price rows) only appears under the "All platforms" filter.
    const onActive = listed.length ? listed.some((p) => activePlatforms.includes(p)) : activePlatforms.length >= 2;
    if (!onActive) continue;

    rows.push({
      item: name,
      platforms: new Set(listed.filter((p) => activePlatforms.includes(p))),
      units: 0,
      revenue: 0,
      cogs: 0,
      lastCost: costAsOf(costRows, name, asOf, dbAliases),
      avgPrice: null,
      perPlatform: {},
      listPrice: {
        Talabat: priceAsOf(prices, name, "Talabat", asOf, dbAliases),
        Careem: priceAsOf(prices, name, "Careem", asOf, dbAliases),
      },
      productMargin: null,
      commMargin: null,
      netMargin: null,
      category: categoryFor(name, catMap, dbAliases),
      zeroSales: true,
    });
  }
  return rows;
}
