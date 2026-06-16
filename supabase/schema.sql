-- Run once in Supabase SQL Editor

create table if not exists trust_data (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz default now()
);

create index if not exists trust_data_updated_at_idx on trust_data (updated_at desc);
