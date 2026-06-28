import { supabase } from "@/integrations/supabase/client";
import { normalizeItemName, type DbAliasMap } from "./costs";

/** Fetch item_aliases from Supabase and return a normalized lookup map. */
export async function loadDbAliases(): Promise<DbAliasMap> {
  const { data } = await supabase.from("item_aliases").select("raw_name,canonical_name");
  const map: DbAliasMap = {};
  for (const r of data ?? []) {
    map[normalizeItemName(r.raw_name)] = normalizeItemName(r.canonical_name);
  }
  return map;
}
