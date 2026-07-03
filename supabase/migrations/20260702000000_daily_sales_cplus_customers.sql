-- Careem Plus loyalty is only exported as daily customer counts (Customer Insights →
-- "No. of customers" → "Careem Plus, non Careem Plus"). Store those counts on daily_sales.
alter table daily_sales
  add column if not exists cplus_customers integer,
  add column if not exists non_cplus_customers integer;
