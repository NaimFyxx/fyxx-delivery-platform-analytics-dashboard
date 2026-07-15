-- Track gap-fill rows in the pace tracker: days auto-inserted with 0 sales / 0 orders to fill a
-- skipped range are flagged, so a real (manually entered) zero looks different from a gap-fill zero.
alter table pace_daily
  add column if not exists auto_filled boolean not null default false;
