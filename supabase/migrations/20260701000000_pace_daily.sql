create table pace_daily (
  id          uuid        not null default gen_random_uuid() primary key,
  date        date        not null,
  platform    public.platform not null,
  sales_jod   numeric(12,3) not null default 0,
  orders      integer,
  created_at  timestamptz not null default now(),
  unique (date, platform)
);

alter table pace_daily enable row level security;

grant select, insert, update, delete on pace_daily to authenticated;
grant select on pace_daily to anon;

create policy "auth users manage pace_daily"
  on pace_daily for all
  to authenticated
  using (auth.uid() is not null)
  with check (auth.uid() is not null);
