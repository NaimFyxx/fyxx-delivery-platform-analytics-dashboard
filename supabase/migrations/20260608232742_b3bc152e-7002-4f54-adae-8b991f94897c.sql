ALTER TABLE public.daily_sales
  ADD COLUMN IF NOT EXISTS cplus_sales_jod numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cplus_orders integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cplus_aov numeric NOT NULL DEFAULT 0;