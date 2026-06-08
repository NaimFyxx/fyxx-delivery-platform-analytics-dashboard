DROP TABLE IF EXISTS public.import_log;

CREATE TABLE public.import_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  platform text NOT NULL,
  report_type text NOT NULL,
  file_name text NOT NULL,
  rows_imported integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'success',
  error_message text,
  imported_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.import_log TO authenticated;
GRANT ALL ON public.import_log TO service_role;

ALTER TABLE public.import_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage import_log" ON public.import_log FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);