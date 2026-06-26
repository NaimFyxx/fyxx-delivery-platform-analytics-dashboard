-- Talabat Pro loyalty columns on daily_sales, mirroring the existing cplus_* columns.
-- The importer (buildPerformance in src/routes/_authenticated/import.tsx) writes
-- pro_orders + pro_sales_jod, so these exact names are required.
-- Nullable; does NOT touch the existing cplus_orders / cplus_sales_jod columns. Idempotent.
ALTER TABLE public.daily_sales
  ADD COLUMN IF NOT EXISTS pro_orders integer,
  ADD COLUMN IF NOT EXISTS pro_sales_jod numeric(12,3);

-- Refresh PostgREST's schema cache so the new columns are usable immediately
-- (otherwise the API can keep reporting "column ... in the schema cache" until reload).
NOTIFY pgrst, 'reload schema';
