import { supabase } from "@/integrations/supabase/client";
import { normalizeItemName, type DbAliasMap } from "./costs";

/** Fetch item_aliases from Supabase and return a normalized lookup map. */
export async function loadDbAliases(): Promise<DbAliasMap> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data } = await (supabase as any).from("item_aliases").select("raw_name,canonical_name");
  const map: DbAliasMap = {};
  for (const r of (data ?? []) as { raw_name: string; canonical_name: string }[]) {
    map[normalizeItemName(r.raw_name)] = normalizeItemName(r.canonical_name);
  }
  return map;
}
