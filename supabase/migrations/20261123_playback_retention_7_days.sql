-- Roots Grill Cloud: configurable playback-history retention.
-- Run once in the Supabase SQL Editor. Requires pg_cron.
-- Default retention: 7 days. Does not touch screen pairing, current media, or TV playback.

create extension if not exists pg_cron with schema pg_catalog;

create table if not exists public.grill_retention_settings (
  id boolean primary key default true check (id),
  playback_days integer not null default 7 check (playback_days between 1 and 365),
  updated_at timestamptz not null default now()
);

alter table public.grill_retention_settings enable row level security;
-- No public policies: only trusted SQL/service-role operations may change settings.
insert into public.grill_retention_settings (id, playback_days)
values (true, 7)
on conflict (id) do nothing;

create index if not exists grill_playback_events_started_at_cleanup_idx
  on public.grill_playback_events (started_at);

create or replace function public.grill_cleanup_playback_history()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  retention_days integer;
  deleted_count integer;
begin
  select playback_days into retention_days
  from public.grill_retention_settings where id = true;
  if retention_days is null then
    raise exception 'Playback retention setting missing';
  end if;

  -- Cap each hourly cleanup to avoid a single large transaction.
  with expired as (
    select id from public.grill_playback_events
    where started_at < now() - make_interval(days => retention_days)
    order by started_at
    limit 50000
  )
  delete from public.grill_playback_events e
  using expired
  where e.id = expired.id;
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.grill_cleanup_playback_history() from public, anon, authenticated;
grant execute on function public.grill_cleanup_playback_history() to service_role;

-- Run hourly at minute 17. Named job prevents duplicate schedules on rerun.
select cron.schedule(
  'roots-grill-playback-retention',
  '17 * * * *',
  'select public.grill_cleanup_playback_history();'
);

-- Optional: clear already-expired history immediately (up to 50,000 rows).
-- select public.grill_cleanup_playback_history();
--
-- Change retention later, e.g. 14 days:
-- update public.grill_retention_settings
-- set playback_days = 14, updated_at = now()
-- where id = true;
--
-- Verify:
-- select * from public.grill_retention_settings;
-- select jobname, schedule, active from cron.job where jobname = 'roots-grill-playback-retention';
