-- Item categories: one canonical category per item, editable in the admin/items area.
-- Additive mapping table (like item_aliases): keyed by the normalized canonical item
-- name so it survives re-imports and is NEVER touched by the importer. An item with no
-- row here is treated as "Uncategorised" by the app. Categories are assigned by hand;
-- the app never guesses a category from the item name.

CREATE TABLE IF NOT EXISTS public.item_categories (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  item_key   TEXT        NOT NULL UNIQUE,   -- normalized canonical item name (canonicalItemName output)
  category   TEXT        NOT NULL,          -- one of the fixed category list
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.item_categories TO authenticated;
GRANT ALL ON public.item_categories TO service_role;

ALTER TABLE public.item_categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all item_categories" ON public.item_categories
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE TRIGGER set_updated_at_item_categories
  BEFORE UPDATE ON public.item_categories
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Seed ONLY the unambiguous combo items to "Combos". Everything else stays Uncategorised
-- until assigned by hand. Two inserts:
--   1. Data-driven: bind to the combo names as they actually appear in the data today
--      (matches an optional trailing " Combo", e.g. "We're Not Hungry Combo"), normalized
--      exactly like the app's normalizeItemName.
--   2. Plain canonical keys, so future items imported under these exact names pre-bind too.

INSERT INTO public.item_categories (item_key, category)
SELECT DISTINCT
  trim(regexp_replace(
    regexp_replace(
      replace(lower(item_name), '&', ' and '),
      '\(\s*\d+\s*pcs?\s*\)', ' ', 'g'),
    '\s+', ' ', 'g')) AS item_key,
  'Combos'
FROM (
  SELECT item_name FROM public.monthly_item_sales
  UNION
  SELECT item_name FROM public.item_costs
) s
WHERE trim(regexp_replace(
    regexp_replace(
      replace(lower(item_name), '&', ' and '),
      '\(\s*\d+\s*pcs?\s*\)', ' ', 'g'),
    '\s+', ' ', 'g'))
  ~ '^(double smash burger|wings and things|three''s company|we''re not hungry|solo smash|sides trio)( combo)?$'
ON CONFLICT (item_key) DO NOTHING;

INSERT INTO public.item_categories (item_key, category) VALUES
  ('double smash burger', 'Combos'),
  ('wings and things', 'Combos'),
  ('three''s company', 'Combos'),
  ('we''re not hungry', 'Combos'),
  ('solo smash', 'Combos'),
  ('sides trio', 'Combos')
ON CONFLICT (item_key) DO NOTHING;

NOTIFY pgrst, 'reload schema';
