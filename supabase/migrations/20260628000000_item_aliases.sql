create table item_aliases (
  id uuid default gen_random_uuid() primary key,
  raw_name text not null unique,
  canonical_name text not null,
  created_at timestamptz default now()
);
