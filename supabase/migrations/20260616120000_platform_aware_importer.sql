-- Platform-aware importer support.
-- ADDITIVE ONLY: new tables + new columns + safer defaults.
-- Does NOT touch item_costs, targets, monthly_item_sales, or any existing data.

-- 1. daily_sales — Talabat Pro loyalty columns (mirrors the existing cplus_* pattern),
--    plus zero-defaults on sales_jod / orders so partial upserts (the Careem Plus skinny
--    files and the order-level day rollup) can insert a row before the daily totals land.
ALTER TABLE public.daily_sales
  ADD COLUMN IF NOT EXISTS pro_orders integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pro_sales_jod numeric(12,3) NOT NULL DEFAULT 0;

ALTER TABLE public.daily_sales
  ALTER COLUMN sales_jod SET DEFAULT 0,
  ALTER COLUMN orders SET DEFAULT 0;

-- 2. platform_orders — one row per order.
--    Talabat Order Report (T1) and Careem Order Level (C1).
--    Idempotent re-import via UNIQUE (platform, order_id).
--    All fee magnitudes stored POSITIVE; gross/payout stored VAT-inclusive as reported.
CREATE TABLE IF NOT EXISTS public.platform_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform public.platform NOT NULL,
  order_id TEXT NOT NULL,
  ordered_at TIMESTAMPTZ,
  date DATE NOT NULL,
  status TEXT,
  gross NUMERIC(12,3) NOT NULL DEFAULT 0,
  net_payout NUMERIC(12,3) NOT NULL DEFAULT 0,
  commission NUMERIC(12,3) NOT NULL DEFAULT 0,     -- Talabat commission (Careem: 0)
  payment_fee NUMERIC(12,3) NOT NULL DEFAULT 0,    -- Talabat online-payment fee / Careem gateway fee (+tax)
  platform_fee NUMERIC(12,3) NOT NULL DEFAULT 0,   -- Careem platform fee (+tax) (Talabat: 0)
  discount NUMERIC(12,3) NOT NULL DEFAULT 0,
  is_loyalty BOOLEAN,                              -- Talabat Pro flag; NULL for Careem (loyalty comes from Plus files)
  payment_mode TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (platform, order_id)
);
CREATE INDEX IF NOT EXISTS platform_orders_date_idx ON public.platform_orders (platform, date);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_orders TO authenticated;
GRANT ALL ON public.platform_orders TO service_role;
ALTER TABLE public.platform_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all platform_orders" ON public.platform_orders
  FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE TRIGGER set_updated_at_platform_orders
  BEFORE UPDATE ON public.platform_orders FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 3. monthly_adjustments — Careem monthly deductions (bank transfer fee + tax, Plus contribution).
--    Amount stored POSITIVE (a deduction). order_id defaults to '-' so weekly bank-fee rows
--    (no order id) still participate in the dedupe key.
CREATE TABLE IF NOT EXISTS public.monthly_adjustments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform public.platform NOT NULL,
  date DATE NOT NULL,
  month TEXT NOT NULL,
  deduction_type TEXT NOT NULL,
  order_id TEXT NOT NULL DEFAULT '-',
  amount NUMERIC(12,3) NOT NULL DEFAULT 0,
  comments TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (platform, date, deduction_type, order_id, amount)
);
CREATE INDEX IF NOT EXISTS monthly_adjustments_month_idx ON public.monthly_adjustments (platform, month);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.monthly_adjustments TO authenticated;
GRANT ALL ON public.monthly_adjustments TO service_role;
ALTER TABLE public.monthly_adjustments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all monthly_adjustments" ON public.monthly_adjustments
  FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
