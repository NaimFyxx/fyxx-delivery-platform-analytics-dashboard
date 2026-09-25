-- Per-user display preference: how the Insights product-performance section appears.
--   'grid'  photo tiles  (the default)
--   'rows'  ranked rows with small thumbnails
--
-- Stored on profiles so it follows the user between devices. The public read-only link has no
-- logged-in user and defaults to 'grid' in the client with no persistence. Mirrors pace_view_mode.
-- Touches no business data. Idempotent: safe to re-run. profiles already has RLS (users read/update
-- their own row).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS item_view_mode TEXT NOT NULL DEFAULT 'grid';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_item_view_mode_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_item_view_mode_check
      CHECK (item_view_mode IN ('grid', 'rows'));
  END IF;
END $$;

-- Make PostgREST pick up the new column immediately (clears the schema-cache error).
NOTIFY pgrst, 'reload schema';
