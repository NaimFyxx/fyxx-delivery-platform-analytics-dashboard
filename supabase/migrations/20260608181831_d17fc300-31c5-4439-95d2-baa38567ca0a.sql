
-- platform enum
CREATE TYPE public.platform AS ENUM ('Talabat', 'Careem');

-- profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  email TEXT,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles readable by authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data ->> 'display_name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- daily_sales
CREATE TABLE public.daily_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  platform public.platform NOT NULL,
  sales_jod NUMERIC(12,3) NOT NULL,
  orders INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (date, platform)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_sales TO authenticated;
GRANT ALL ON public.daily_sales TO service_role;
ALTER TABLE public.daily_sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all daily_sales" ON public.daily_sales FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- monthly_financials
CREATE TABLE public.monthly_financials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month TEXT NOT NULL,
  platform public.platform NOT NULL,
  gross_sales NUMERIC(12,3) NOT NULL,
  actual_payout NUMERIC(12,3) NOT NULL,
  cogs NUMERIC(12,3) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (month, platform)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.monthly_financials TO authenticated;
GRANT ALL ON public.monthly_financials TO service_role;
ALTER TABLE public.monthly_financials ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all monthly_financials" ON public.monthly_financials FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- item_costs (versioned)
CREATE TABLE public.item_costs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  item_name TEXT NOT NULL,
  cost_exvat NUMERIC(12,4) NOT NULL,
  effective_from DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX item_costs_lookup ON public.item_costs (item_name, effective_from DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.item_costs TO authenticated;
GRANT ALL ON public.item_costs TO service_role;
ALTER TABLE public.item_costs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all item_costs" ON public.item_costs FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- monthly_item_sales
CREATE TABLE public.monthly_item_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month TEXT NOT NULL,
  platform public.platform NOT NULL,
  item_name TEXT NOT NULL,
  units INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (month, platform, item_name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.monthly_item_sales TO authenticated;
GRANT ALL ON public.monthly_item_sales TO service_role;
ALTER TABLE public.monthly_item_sales ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all monthly_item_sales" ON public.monthly_item_sales FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- targets
CREATE TABLE public.targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month TEXT NOT NULL,
  platform public.platform NOT NULL,
  sales_target_jod NUMERIC(12,3) NOT NULL,
  orders_target INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (month, platform)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.targets TO authenticated;
GRANT ALL ON public.targets TO service_role;
ALTER TABLE public.targets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all targets" ON public.targets FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER set_updated_at_daily_sales BEFORE UPDATE ON public.daily_sales FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER set_updated_at_monthly_financials BEFORE UPDATE ON public.monthly_financials FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER set_updated_at_monthly_item_sales BEFORE UPDATE ON public.monthly_item_sales FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER set_updated_at_targets BEFORE UPDATE ON public.targets FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
