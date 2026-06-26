-- New vs Returning customer data aggregated monthly per platform.
-- Careem basis = customers; Talabat basis = orders. Never sum across platforms.
-- "returning" is a non-reserved keyword in PostgreSQL and is valid as a column name.

CREATE TABLE IF NOT EXISTS public.monthly_customers (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  month       TEXT        NOT NULL,
  platform    TEXT        NOT NULL,
  basis       TEXT        NOT NULL,           -- "customers" | "orders"
  new         NUMERIC(12,3) NOT NULL DEFAULT 0,
  returning   NUMERIC(12,3) NOT NULL DEFAULT 0,
  reactivated NUMERIC(12,3) NOT NULL DEFAULT 0,
  overall     NUMERIC(12,3) NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (month, platform)
);

CREATE INDEX IF NOT EXISTS monthly_customers_month_idx
  ON public.monthly_customers (platform, month);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.monthly_customers TO authenticated;
GRANT ALL ON public.monthly_customers TO service_role;

ALTER TABLE public.monthly_customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all monthly_customers" ON public.monthly_customers
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE TRIGGER set_updated_at_monthly_customers
  BEFORE UPDATE ON public.monthly_customers
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

NOTIFY pgrst, 'reload schema';
