-- List prices per item per platform (what the customer sees in the app, incl VAT).
-- One row per (item_name, platform); saving again overwrites via upsert.

CREATE TABLE IF NOT EXISTS public.item_prices (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  item_name      TEXT        NOT NULL,
  platform       TEXT        NOT NULL,          -- 'Talabat' | 'Careem'
  price_incl_vat NUMERIC(10,3) NOT NULL,        -- listed price the customer sees (incl VAT)
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (item_name, platform)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.item_prices TO authenticated;
GRANT ALL ON public.item_prices TO service_role;

ALTER TABLE public.item_prices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all item_prices" ON public.item_prices
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE TRIGGER set_updated_at_item_prices
  BEFORE UPDATE ON public.item_prices
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

NOTIFY pgrst, 'reload schema';
