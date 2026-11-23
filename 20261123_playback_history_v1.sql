-- Roots Grill Cloud: playback event history V1
-- Additive migration. Does not modify existing screens, pairing, or media.
create table if not exists public.grill_playback_events (
  id uuid primary key default gen_random_uuid(),
  screen_id text not null,
  media_id text not null,
  media_name text not null,
  started_at timestamptz not null,
  duration_ms integer,
  reported_at timestamptz not null default now(),
  constraint grill_playback_events_duration_nonnegative check (duration_ms is null or duration_ms >= 0)
);
create index if not exists grill_playback_events_screen_recent_idx
  on public.grill_playback_events (screen_id, started_at desc);
create unique index if not exists grill_playback_events_dedupe_idx
  on public.grill_playback_events (screen_id, media_id, started_at);
alter table public.grill_playback_events enable row level security;
-- No client-facing RLS policies: authenticated screen reporting and
-- Head Office reads will be handled by authorized Edge Functions.
comment on table public.grill_playback_events is
  'Verified player-reported playback transitions per registered screen.';
