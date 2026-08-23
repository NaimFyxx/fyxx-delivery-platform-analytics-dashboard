-- Item categories: one canonical category per item, editable in the admin/items area.
-- Additive mapping table (like item_aliases): keyed by the normalized canonical item
-- name so it survives re-imports and is NEVER touched by the importer. An item with no
-- row here is treated as "Uncategorised" by the app. Categories are assigned by hand;
-- the app never guesses a category from the item name.
--
-- RLS mirrors public.item_costs: writable by the authenticated (admin) context; the
-- public read-only dashboard reads it through the service-role client (getDashboardData),
-- which bypasses RLS. Idempotent so it can be applied via Lovable or pasted into the
-- Supabase SQL editor to fix a missing table.

CREATE TABLE IF NOT EXISTS public.item_categories (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  item_key   TEXT        NOT NULL UNIQUE,   -- normalized canonical item name (canonicalItemName output)
  category   TEXT        NOT NULL,          -- one of the fixed category list
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.item_categories TO authenticated;
GRANT ALL ON public.item_categories TO service_role;

ALTER TABLE public.item_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth all item_categories" ON public.item_categories;
CREATE POLICY "auth all item_categories" ON public.item_categories
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS set_updated_at_item_categories ON public.item_categories;
CREATE TRIGGER set_updated_at_item_categories
  BEFORE UPDATE ON public.item_categories
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Seed categories for the items the dashboard tracks. Keyed by the canonical item name
-- (the app's normalizeItemName + alias resolution), so every raw variant binds: "&" vs
-- "and", a trailing "(12pcs)", the "Nuts" -> "nuts, olives and pickles" alias, the
-- "beetroot and lentils salad" -> "beetroot and lentils" alias, and a "Combo" suffix all
-- resolve to the same key. Idempotent: re-running re-asserts the category. Any tracked
-- item not listed here stays Uncategorised (no row). Categories stay the fixed list:
-- Combos, Sandos, Mazmez, Salads, Charcoal Grills, Deli, Desserts, Beverages.
INSERT INTO public.item_categories (item_key, category)
VALUES
  ('tgr smash burger', 'Sandos'),
  ('basterma bikini', 'Sandos'),
  ('fish filet', 'Sandos'),
  ('roast beef au jus', 'Sandos'),
  ('corn ribs', 'Mazmez'),
  ('tgr fries', 'Mazmez'),
  ('spicy smashed cucumbers', 'Mazmez'),
  ('gambas al pil pil', 'Mazmez'),
  ('whipped butter', 'Mazmez'),
  ('nuts olives and pickles', 'Mazmez'),
  ('nuts, olives and pickles', 'Mazmez'),
  ('salt and pepper chicken wings', 'Charcoal Grills'),
  ('mb7 wagyu', 'Charcoal Grills'),
  ('soy braised octopus', 'Charcoal Grills'),
  ('whole eggplant', 'Charcoal Grills'),
  ('very green salad', 'Salads'),
  ('beetroot and lentils', 'Salads'),
  ('salt and vinegar potato salad', 'Salads'),
  ('assorted cheese plate', 'Deli'),
  ('beef bresaola and salami', 'Deli'),
  ('caramelized brie', 'Deli'),
  ('creme caramel', 'Desserts'),
  ('g cola', 'Beverages'),
  ('red bull sugar free', 'Beverages'),
  ('solan sparkling 330ml', 'Beverages'),
  ('double smash burger', 'Combos'),
  ('wings and things', 'Combos'),
  ('three''s company', 'Combos'),
  ('we''re not hungry', 'Combos'),
  ('we''re not hungry combo', 'Combos'),
  ('solo smash', 'Combos'),
  ('sides trio', 'Combos')
ON CONFLICT (item_key) DO UPDATE SET category = EXCLUDED.category;

-- Make PostgREST pick up the new table immediately (clears the schema-cache error).
NOTIFY pgrst, 'reload schema';
