ALTER TABLE public.monthly_financials
  ADD COLUMN IF NOT EXISTS discount numeric(12,3) NOT NULL DEFAULT 0;

NOTIFY pgrst, 'reload schema';