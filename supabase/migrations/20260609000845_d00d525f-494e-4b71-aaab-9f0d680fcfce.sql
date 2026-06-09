ALTER TABLE public.monthly_item_sales
  ADD COLUMN IF NOT EXISTS revenue_jod numeric NOT NULL DEFAULT 0;