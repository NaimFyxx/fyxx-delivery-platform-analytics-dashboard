
CREATE TABLE public.import_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source TEXT NOT NULL,
  target_table TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'success',
  rows_total INTEGER NOT NULL DEFAULT 0,
  rows_inserted INTEGER NOT NULL DEFAULT 0,
  rows_updated INTEGER NOT NULL DEFAULT 0,
  rows_failed INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  error_message TEXT,
  imported_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_log TO authenticated;
GRANT ALL ON public.import_log TO service_role;
ALTER TABLE public.import_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all import_log" ON public.import_log FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE INDEX import_log_created_idx ON public.import_log (created_at DESC);
