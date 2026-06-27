CREATE TABLE IF NOT EXISTS public.item_prices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_name text NOT NULL,
  platform text NOT NULL,
  price_incl_vat numeric(12,3) NOT NULL,
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS item_prices_lookup_idx ON public.item_prices (item_name, platform, effective_from);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.item_prices TO authenticated;
GRANT ALL ON public.item_prices TO service_role;

ALTER TABLE public.item_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated full access to item_prices" ON public.item_prices;
CREATE POLICY "Authenticated full access to item_prices"
  ON public.item_prices FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS set_item_prices_updated_at ON public.item_prices;
CREATE TRIGGER set_item_prices_updated_at
  BEFORE UPDATE ON public.item_prices
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

NOTIFY pgrst, 'reload schema';