ALTER TABLE public.monthly_financials ADD COLUMN IF NOT EXISTS commission numeric NOT NULL DEFAULT 0;
ALTER TABLE public.monthly_financials ALTER COLUMN cogs SET DEFAULT 0;