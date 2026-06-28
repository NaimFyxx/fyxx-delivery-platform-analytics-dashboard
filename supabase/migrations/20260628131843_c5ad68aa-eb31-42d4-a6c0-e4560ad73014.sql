CREATE TABLE IF NOT EXISTS public.item_aliases (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  raw_name text NOT NULL UNIQUE,
  canonical_name text NOT NULL,
  created_at timestamptz DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.item_aliases TO authenticated;
GRANT ALL ON public.item_aliases TO service_role;

ALTER TABLE public.item_aliases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth all item_aliases" ON public.item_aliases;
CREATE POLICY "auth all item_aliases" ON public.item_aliases
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);