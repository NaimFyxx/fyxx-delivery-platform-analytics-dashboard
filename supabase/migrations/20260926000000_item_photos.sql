-- Item photos: one Shopify catalogue photo per item, keyed by the canonical normalized item
-- name (canonicalItemName output), the same convention as item_categories, so it resolves through
-- the existing alias path with no new matching logic. Additive and NEVER touched by the importer.
-- An item with no row here falls back to a category icon in the app.
--
-- RLS mirrors public.item_categories: writable by the authenticated (admin) context; the public
-- read-only dashboard reads it through the service-role client (getDashboardData), which bypasses
-- RLS. Idempotent so it can be applied via Lovable or pasted into the Supabase SQL editor.
--
-- Read the photo at render time with Shopify CDN sizing, for example:
--   <photo_url>&width=400&height=400&crop=center   (URLs already carry ?v=..., so append with &)

CREATE TABLE IF NOT EXISTS public.item_photos (
  item_key   TEXT        PRIMARY KEY,          -- normalized canonical item name
  photo_url  TEXT        NOT NULL,
  source     TEXT        NOT NULL DEFAULT 'shopify',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.item_photos TO authenticated;
GRANT ALL ON public.item_photos TO service_role;

ALTER TABLE public.item_photos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth all item_photos" ON public.item_photos;
CREATE POLICY "auth all item_photos" ON public.item_photos
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Seed 33 rows from Shopify product featured images (product_type 'Fyxx Food', ACTIVE, 26 Sep 2026).
-- Two pairs are spelling variants of the same dish; both are seeded so either resolves. The
-- 20260926000200_item_photo_aliases migration then adds the aliases and drops the two redundant
-- Shopify-spelled rows ('fish fillet', 'gambas pil pil'). Idempotent upsert.
INSERT INTO public.item_photos (item_key, photo_url) VALUES
  ('assorted cheese plate', 'https://cdn.shopify.com/s/files/1/0108/6328/0224/files/AssortedCheesePlate_3.png?v=1760133822'),
  ('basterma bikini', 'https://cdn.shopify.com/s/files/1/0108/6328/0224/files/BastermaBikini.png?v=1760008616'),
  ('beef bresaola and salami', 'https://cdn.shopify.com/s/files/1/0108/6328/0224/files/BeefBresaolaandSalami.png?v=1760133657'),
  ('beetroot and lentils', 'https://cdn.shopify.com/s/files/1/0108/6328/0224/files/Beetroot_Lentils.png?v=1760128682'),
  ('braised ox tail', 'https://cdn.shopify.com/s/files/1/0108/6328/0224/files/BraisedOxTail.png?v=1766935636'),
  ('burrata and tomatoes', 'https://cdn.shopify.com/s/files/1/0108/6328/0224/files/Burrata_Tomatoes_5c504617-dbb2-4008-b84f-4a8c57829595.png?v=1760128644'),
  ('caramelized brie', 'https://cdn.shopify.com/s/files/1/0108/6328/0224/files/Caramelized_Brie_2.png?v=1760133850'),
  ('corn ribs', 'https://cdn.shopify.com/s/files/1/0108/6328/0224/files/CornRibs_5.png?v=1760011741'),
  ('creme caramel', 'https://cdn.shopify.com/s/files/1/0108/6328/0224/files/CremeCaramel.png?v=1760134057'),
  ('fish fillet', 'https://cdn.shopify.com/s/files/1/0108/6328/0224/files/FishFillet.png?v=1766936410'),
  ('gambas pil pil', 'https://cdn.shopify.com/s/files/1/0108/6328/0224/files/TGR-WebsiteFoodPhotos_1.png?v=1766936000'),
  ('hamachi ceviche', 'https://cdn.shopify.com/s/files/1/0108/6328/0224/files/HamachiCeviche.png?v=1760130087'),
  ('mb7 wagyu', 'https://cdn.shopify.com/s/files/1/0108/6328/0224/files/Untitleddesign_8.png?v=1759933476'),
  ('mortadella bun', 'https://cdn.shopify.com/s/files/1/0108/6328/0224/files/mortadellabun.png?v=1766938315'),
  ('nuts, olives and pickles', 'https://cdn.shopify.com/s/files/1/0108/6328/0224/files/Nuts_Olives_Pickles_2.png?v=1760010450'),
  ('oyster mushroom', 'https://cdn.shopify.com/s/files/1/0108/6328/0224/files/OysterMushroom_1.png?v=1766937911'),
  ('pan con tomate', 'https://cdn.shopify.com/s/files/1/0108/6328/0224/files/PanConTomate.png?v=1760011097'),
  ('pork mortadella and spicy chorizo', 'https://cdn.shopify.com/s/files/1/0108/6328/0224/files/PorkMortadella_SpicyChorizo.png?v=1760133690'),
  ('roast beef au jus', 'https://cdn.shopify.com/s/files/1/0108/6328/0224/files/RoastBeefaujus.png?v=1766936583'),
  ('salt and pepper chicken wings', 'https://cdn.shopify.com/s/files/1/0108/6328/0224/files/Salt_PepperChickenWings.png?v=1760131701'),
  ('salt and vinegar potato salad', 'https://cdn.shopify.com/s/files/1/0108/6328/0224/files/Salt_VinegarPotatoSalad.png?v=1760128525'),
  ('smoked beef tartare', 'https://cdn.shopify.com/s/files/1/0108/6328/0224/files/SmokedBeefTartare.png?v=1760130027'),
  ('soy braised octopus', 'https://cdn.shopify.com/s/files/1/0108/6328/0224/files/SoyBraisedOctopus.png?v=1760131634'),
  ('spanish anchovies', 'https://cdn.shopify.com/s/files/1/0108/6328/0224/files/SpanishAnchovies_4.png?v=1760133987'),
  ('spicy smashed cucumbers', 'https://cdn.shopify.com/s/files/1/0108/6328/0224/files/Spicy_Smashed_Cucumbers.png?v=1760010745'),
  ('tgr fries', 'https://cdn.shopify.com/s/files/1/0108/6328/0224/files/TGR_Fries_2.png?v=1760012213'),
  ('tgr smash burger', 'https://cdn.shopify.com/s/files/1/0108/6328/0224/files/TGR_Smash_Burger_5.png?v=1760126481'),
  ('tuna tartare', 'https://cdn.shopify.com/s/files/1/0108/6328/0224/files/TunaTartare.png?v=1760129946'),
  ('very green salad', 'https://cdn.shopify.com/s/files/1/0108/6328/0224/files/VeryGreenSalad.png?v=1760128436'),
  ('whipped butter', 'https://cdn.shopify.com/s/files/1/0108/6328/0224/files/WhippedButter.png?v=1760009412'),
  ('whole eggplant', 'https://cdn.shopify.com/s/files/1/0108/6328/0224/files/TGR-WebsiteFoodPhotos_2.png?v=1766936245'),
  ('fish filet', 'https://cdn.shopify.com/s/files/1/0108/6328/0224/files/FishFillet.png?v=1766936410'),
  ('gambas al pil pil', 'https://cdn.shopify.com/s/files/1/0108/6328/0224/files/TGR-WebsiteFoodPhotos_1.png?v=1766936000')
ON CONFLICT (item_key) DO UPDATE
  SET photo_url  = EXCLUDED.photo_url,
      source     = EXCLUDED.source,
      updated_at = now();

-- Make PostgREST pick up the new table immediately (clears the schema-cache error).
NOTIFY pgrst, 'reload schema';
