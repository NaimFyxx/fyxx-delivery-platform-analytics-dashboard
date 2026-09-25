-- Unify two Shopify spelling variants with the cost/category tables via item_aliases, then drop the
-- now-redundant duplicate item_photos rows. Both changes live in ONE migration so they can never
-- land apart: the alias makes the Shopify spelling resolve to the canonical name, and only then are
-- the duplicate photo rows safe to delete.
--
-- MUST run after 20260926000000_item_photos.sql (it deletes rows that migration inserted).
--
--   Fish Fillet     -> Fish Filet
--   Gambas Pil Pil  -> Gambas al Pil Pil
--
-- Safe by design: loadDbAliases normalizes both sides, and canonicalItemName does a single lookup
-- (dbAliases[norm] ?? ALIASES[norm] ?? norm). The targets ('fish filet', 'gambas al pil pil') are
-- not themselves alias keys, so there is no chained lookup. If a platform report ever uses the
-- "Fish Fillet" / "Gambas Pil Pil" spelling it now resolves to the canonical dish, which is exactly
-- the intent (one dish, one set of figures).

INSERT INTO public.item_aliases (raw_name, canonical_name) VALUES
  ('Fish Fillet', 'Fish Filet'),
  ('Gambas Pil Pil', 'Gambas al Pil Pil')
ON CONFLICT (raw_name) DO UPDATE
  SET canonical_name = EXCLUDED.canonical_name;

-- The canonical rows ('fish filet', 'gambas al pil pil') stay; every lookup goes through the alias
-- to them, so the Shopify-spelled rows are redundant.
DELETE FROM public.item_photos
  WHERE item_key IN ('fish fillet', 'gambas pil pil');

-- Make PostgREST pick up the changes immediately.
NOTIFY pgrst, 'reload schema';
