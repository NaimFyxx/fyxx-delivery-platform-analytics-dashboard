-- Talabat's Order Report carries per-order Ads Fee and Marketing Fees Total (mostly Pro
-- delivery-loyalty charges). Aggregate them per month so Talabat paid-ad / loyalty spend shows in
-- the Promotions view alongside Careem's ADVERTISEMENTS / CPLUS_FEE adjustments.
alter table monthly_financials
  add column if not exists ads_fee numeric,
  add column if not exists marketing_fees numeric;
