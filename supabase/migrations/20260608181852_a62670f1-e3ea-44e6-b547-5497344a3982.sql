
-- Tighten trigger functions
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_set_updated_at() FROM PUBLIC, anon, authenticated;

-- Replace permissive ALL policies with auth.uid() IS NOT NULL
DROP POLICY "auth all daily_sales" ON public.daily_sales;
CREATE POLICY "auth all daily_sales" ON public.daily_sales FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY "auth all monthly_financials" ON public.monthly_financials;
CREATE POLICY "auth all monthly_financials" ON public.monthly_financials FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY "auth all item_costs" ON public.item_costs;
CREATE POLICY "auth all item_costs" ON public.item_costs FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY "auth all monthly_item_sales" ON public.monthly_item_sales;
CREATE POLICY "auth all monthly_item_sales" ON public.monthly_item_sales FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY "auth all targets" ON public.targets;
CREATE POLICY "auth all targets" ON public.targets FOR ALL TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
