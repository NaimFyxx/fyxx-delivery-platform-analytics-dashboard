-- Convert item_prices from single-row-per-(item,platform) to versioned append-only model
-- mirroring item_costs: each price change adds a row with an effective_from date.

ALTER TABLE public.item_prices DROP CONSTRAINT IF EXISTS item_prices_item_name_platform_key;
ALTER TABLE public.item_prices ADD COLUMN IF NOT EXISTS effective_from date NOT NULL DEFAULT CURRENT_DATE;
