-- Combined stretch target: one optional upside figure per month, on top of the per-platform base
-- targets in public.targets (Talabat base + Careem base = combined base). Stretch is combined-grain,
-- not per-platform, so it lives in its own one-row-per-month table rather than overloading targets.
--
-- RLS mirrors public.targets / public.item_categories: writable by the authenticated (admin) context;
-- the public read-only dashboard reads it through the service-role client (getDashboardData), which
-- bypasses RLS. Idempotent so it can be pasted into the Supabase SQL editor or applied via Lovable.

CREATE TABLE IF NOT EXISTS public.monthly_stretch_targets (
  month       TEXT        PRIMARY KEY,                 -- 'YYYY-MM'
  stretch_jod NUMERIC     NOT NULL CHECK (stretch_jod >= 0),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.monthly_stretch_targets TO authenticated;
GRANT ALL ON public.monthly_stretch_targets TO service_role;

ALTER TABLE public.monthly_stretch_targets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "auth all monthly_stretch_targets" ON public.monthly_stretch_targets;
CREATE POLICY "auth all monthly_stretch_targets" ON public.monthly_stretch_targets
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS set_updated_at_monthly_stretch_targets ON public.monthly_stretch_targets;
CREATE TRIGGER set_updated_at_monthly_stretch_targets
  BEFORE UPDATE ON public.monthly_stretch_targets
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Make PostgREST pick up the new table immediately (clears the schema-cache error).
NOTIFY pgrst, 'reload schema';
