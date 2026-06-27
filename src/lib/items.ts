import { costAsOf, canonicalItemName, normalizeItemName, priceAsOf, type CostRow } from "./costs";

const VAT = 0.16;
const exVat = (v: number) => v / (1 + VAT);

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
}): AggItem[] {
  const { itemSales, costs, prices, financials, rangeMonths, platforms } = args;
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

    const canonKey = canonicalItemName(s.item);
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
    const c = costAsOf(costs, canonicalItemName(s.item), asOf);
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
        knownPlatforms.map((p) => [p, priceAsOf(prices, r.item, p, lastMonthEnd)]),
      ) as Record<string, number | null>,
      productMargin: r.revenue > 0 ? ((exVat(r.revenue) - r.cogs) / exVat(r.revenue)) * 100 : null,
      commMargin: r.commPayout > 0 ? ((r.commPayout - r.cogs) / r.commPayout) * 100 : null,
      netMargin: r.netPayout > 0 ? (r.netProfit / r.netPayout) * 100 : null,
    }));
}
