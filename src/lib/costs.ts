/**
 * Pure cost-lookup logic — no UI imports, so it can be unit-tested and reused.
 *
 * The versioned `item_costs` table is keyed by the platform item name (the name that
 * comes through the delivery reports). Talabat and Careem spell some items differently
 * ("&" vs "and", a trailing "(12pcs)", etc.), so we normalize both sides before matching,
 * and fall back to a bare "base" row for optioned items.
 */

export interface CostRow {
  item: string;
  cost: number;
  effective_from: string; // YYYY-MM-DD
}
export interface ItemSaleRow {
  month: string;
  platform: string;
  item: string;
  units: number;
}

/**
 * Normalize an item name for cross-platform matching:
 *   - lowercase
 *   - treat "&" and "and" as the same
 *   - strip a trailing quantity tag like "(12pcs)" / "(12 pcs)"
 *   - collapse whitespace and trim
 */
export function normalizeItemName(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\(\s*\d+\s*pcs?\s*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Known cross-platform name variants that normalizeItemName alone can't collapse.
 * Keys are normalized; values are the canonical normalized name.
 * Extend this table as new mismatches are found.
 */
const ALIASES: Record<string, string> = {
  "beetroot and lentils salad": "beetroot and lentils",
  "nuts": "nuts, olives and pickles",
};

/**
 * DB-backed alias map: normalized raw_name → normalized canonical_name.
 * Loaded at import/query time and passed in where needed.
 */
export type DbAliasMap = Record<string, string>;

/**
 * Returns the canonical normalized name for an item.
 * Checks dbAliases first (if provided), then the hardcoded ALIASES map.
 */
export function canonicalItemName(s: string, dbAliases?: DbAliasMap): string {
  const norm = normalizeItemName(s);
  return dbAliases?.[norm] ?? ALIASES[norm] ?? norm;
}

/** Base name with option/modifier decorations removed — any "(...)" or "[...]" group.
 *  e.g. "TGR Smash Burger [1 With cheese]" → "tgr smash burger". */
export function baseItemName(s: string): string {
  return normalizeItemName(s.replace(/[([][^)\]]*[)\]]/g, " "));
}

/** Normalized name with parens/brackets turned into spaces (keeps the words inside).
 *  e.g. "TGR Smash Burger (With Fries)" → "tgr smash burger with fries". */
function decoredWords(s: string): string {
  return normalizeItemName(s.replace(/[()[\]]/g, " "));
}

/**
 * For one item, return the cost active as of asOfDate (YYYY-MM-DD): the row with the
 * GREATEST effective_from that is <= asOfDate. Returns null if nothing matches / is
 * effective yet. Matching is, in order:
 *   1. exact (normalized) name
 *   2. an optioned variant whose option phrase the report line carries
 *      (e.g. report "… [1 With Salad]" → the "(With Salad)" cost row)
 *   3. the bare base row (fallback when the report shows no option)
 */
export function costAsOf(costs: CostRow[], item: string, asOfDate: string, dbAliases?: DbAliasMap): number | null {
  // Resolve through aliases first so a merged item finds its canonical cost row.
  const resolved = canonicalItemName(item, dbAliases);
  const q = normalizeItemName(resolved);
  const qWords = decoredWords(resolved);

  const latest = (rows: CostRow[]): number | null => {
    let best: CostRow | null = null;
    for (const c of rows) {
      if (c.effective_from > asOfDate) continue;
      if (!best || c.effective_from > best.effective_from) best = c;
    }
    return best ? best.cost : null;
  };

  // 1. exact normalized match
  const exact = latest(costs.filter((c) => normalizeItemName(canonicalItemName(c.item, dbAliases)) === q));
  if (exact != null) return exact;

  // 2 & 3. optioned-item matching against the shared base
  const base = baseItemName(item);
  const sameBase = costs.filter((c) => baseItemName(c.item) === base);

  for (const c of sameBase) {
    const full = decoredWords(c.item);
    if (full === base) continue; // bare row, handled in step 3
    const phrase = full.startsWith(base) ? full.slice(base.length).trim() : full;
    if (phrase && qWords.includes(phrase)) {
      const hit = latest(
        sameBase.filter((x) => normalizeItemName(x.item) === normalizeItemName(c.item)),
      );
      if (hit != null) return hit;
    }
  }

  const bare = latest(sameBase.filter((c) => normalizeItemName(c.item) === base));
  if (bare != null) return bare;

  return null;
}

/**
 * For one item + platform, return the price active as of asOfDate: the row with the
 * GREATEST effective_from that is <= asOfDate. Returns null if nothing found.
 * Canonicalizes both sides so alias variants resolve correctly.
 */
export function priceAsOf(
  prices: { item_name: string; platform: string; price_incl_vat: number; effective_from?: string }[],
  item: string,
  platform: string,
  asOf: string,
  dbAliases?: DbAliasMap,
): number | null {
  const canonItem = canonicalItemName(item, dbAliases);
  let best: { price: number; from: string } | null = null;
  for (const p of prices) {
    if (canonicalItemName(p.item_name, dbAliases) !== canonItem || p.platform !== platform) continue;
    const from = p.effective_from ?? "0000-01-01";
    if (from > asOf) continue;
    if (!best || from > best.from) best = { price: Number(p.price_incl_vat), from };
  }
  return best ? best.price : null;
}

function lastDayOfMonth(m: string): string {
  const [y, mm] = m.split("-").map(Number);
  return new Date(Date.UTC(y, mm, 0)).toISOString().slice(0, 10);
}

/** COGS for a (month, platforms) using the cost version active during that month. */
export function cogsFor(
  itemSales: ItemSaleRow[],
  costs: CostRow[],
  month: string,
  platforms: string[],
  dbAliases?: DbAliasMap,
): number {
  const asOf = lastDayOfMonth(month);
  let total = 0;
  for (const s of itemSales) {
    if (s.month !== month) continue;
    if (!platforms.includes(s.platform)) continue;
    const c = costAsOf(costs, s.item, asOf, dbAliases);
    if (c != null) total += s.units * c;
  }
  return total;
}
