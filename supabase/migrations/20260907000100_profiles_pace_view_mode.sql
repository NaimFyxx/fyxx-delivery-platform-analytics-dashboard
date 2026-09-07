-- Per-user display preference: how the pace tracker appears while browsing.
--   'card'  full card on Overview only
--   'both'  card on Overview, slim bar on every other page  (the default)
--   'bar'   no card, slim bar on every page including Overview
--
-- Stored on profiles so it follows the user between devices. The public read-only link has no
-- logged-in user and defaults to 'both' in the client with no persistence. Touches no business data.
-- Idempotent: safe to re-run. profiles already has RLS (users read/update their own row).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS pace_view_mode TEXT NOT NULL DEFAULT 'both';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_pace_view_mode_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_pace_view_mode_check
      CHECK (pace_view_mode IN ('card', 'both', 'bar'));
  END IF;
END $$;

-- Make PostgREST pick up the new column immediately (clears the schema-cache error).
NOTIFY pgrst, 'reload schema';
