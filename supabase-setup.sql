-- Supabase SQL Editor で実行してください

create table if not exists reservations (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  slot text not null check (slot in ('昼', '放課後')),
  name text not null,
  created_at timestamptz default now(),
  unique(date, slot)
);

alter table reservations enable row level security;

create policy "anyone can read reservations"
  on reservations for select using (true);

create policy "anyone can insert reservations"
  on reservations for insert with check (true);

create policy "anyone can delete reservations"
  on reservations for delete using (true);
