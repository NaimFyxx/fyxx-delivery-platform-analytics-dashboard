-- Surface the partner-funded discount (the menu-value → net-sales bridge) at the monthly level.
-- Talabat: Voucher Cost To Restaurant (= Total Voucher); Careem: partner-funded catalog/promo.
-- Aggregated from platform_orders.discount in reconcileFinancials; additive, nullable-safe.
-- Does NOT touch the item-cost system or any margin formula.
ALTER TABLE public.monthly_financials
  ADD COLUMN IF NOT EXISTS discount numeric(12,3) NOT NULL DEFAULT 0;

NOTIFY pgrst, 'reload schema';
