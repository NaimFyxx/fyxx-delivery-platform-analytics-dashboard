-- Talabat's per-order Marketing Fees bundle two things (Marketing Fees Reasons): "Sponsored Deals
-- Fee - Boosted" (paid visibility/promotion) and "Loyalty Charges - Pro Delivery Fee" (loyalty).
-- Split the boosted/sponsored portion into its own column so the Promotions view can count it as
-- paid ads, leaving marketing_fees as loyalty only.
alter table monthly_financials
  add column if not exists boosted_fee numeric;
