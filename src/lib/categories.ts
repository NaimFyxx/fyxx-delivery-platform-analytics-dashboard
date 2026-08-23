import { supabase } from "@/integrations/supabase/client";
import { canonicalItemName, type DbAliasMap } from "./costs";

/**
 * Item categories — one canonical category per item, assigned by hand and stored in the
 * additive `item_categories` table (keyed by the normalized canonical item name). Kept
 * separate from the importer so re-imports never overwrite an assignment. An item with no
 * stored row is "Uncategorised".
 */

/** The one default bucket for any item without an assigned category. */
export const UNCATEGORISED = "Uncategorised";

/** Fixed, assignable category list (in menu order). Excludes the Uncategorised default. */
export const CATEGORIES = [
  "Combos",
  "Sandos",
  "Mazmez",
  "Salads",
  "Charcoal Grills",
  "Deli",
  "Desserts",
  "Beverages",
] as const;

/** Every value a category cell can hold, including the default. */
export const ALL_CATEGORY_OPTIONS = [UNCATEGORISED, ...CATEGORIES] as const;

export type Category = (typeof ALL_CATEGORY_OPTIONS)[number];

/** normalized canonical item name → assigned category. */
export type CategoryMap = Record<string, string>;

/** Fetch item_categories from Supabase and return a lookup keyed by canonical item name. */
export async function loadItemCategories(): Promise<CategoryMap> {
  const { data } = await supabase.from("item_categories").select("item_key,category");
  const map: CategoryMap = {};
  for (const r of data ?? []) map[r.item_key] = r.category;
  return map;
}

/** Resolve an item's category, defaulting to Uncategorised. Uses the same canonical
 *  identity as the rest of the app so aliased/merged items share one category. */
export function categoryFor(item: string, catMap: CategoryMap, dbAliases?: DbAliasMap): string {
  return catMap[canonicalItemName(item, dbAliases)] ?? UNCATEGORISED;
}
