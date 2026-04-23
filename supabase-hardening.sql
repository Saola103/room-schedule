-- 既存環境に対して実行
-- 匿名アクセスを閉じ、アプリの Route Handler 経由に限定する

alter table reservations enable row level security;

drop policy if exists "anyone can read reservations" on reservations;
drop policy if exists "anyone can insert reservations" on reservations;
drop policy if exists "anyone can delete reservations" on reservations;

revoke all on table reservations from anon, authenticated;

create table if not exists api_rate_limits (
  key text not null,
  created_at timestamptz not null default now()
);

create index if not exists api_rate_limits_key_created_at_idx
  on api_rate_limits (key, created_at);

create or replace function consume_rate_limit(
  p_key text,
  p_limit integer,
  p_window_seconds integer
)
returns table(allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
as $$
declare
  window_start timestamptz := now() - make_interval(secs => p_window_seconds);
  current_count integer;
  oldest_at timestamptz;
begin
  perform pg_advisory_xact_lock(hashtext(p_key));

  delete from api_rate_limits where created_at < window_start;

  select count(*), min(created_at)
    into current_count, oldest_at
  from api_rate_limits
  where key = p_key
    and created_at >= window_start;

  if current_count >= p_limit then
    return query
    select
      false,
      greatest(
        1,
        ceil(extract(epoch from ((oldest_at + make_interval(secs => p_window_seconds)) - now())))::integer
      );
    return;
  end if;

  insert into api_rate_limits (key) values (p_key);

  return query select true, p_window_seconds;
end;
$$;
