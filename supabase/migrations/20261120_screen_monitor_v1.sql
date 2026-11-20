-- Roots Grill Cloud / Screen Monitor V1. Run in Supabase SQL Editor.
-- Additive only: existing media_items, auth and display-state remain untouched.
create table if not exists public.grill_screens (
  id text primary key,
  label text not null,
  store_id text not null default 'head-office',
  display text not null check (display in ('landscape','portrait')),
  token_hash text not null,
  last_seen timestamptz,
  current_media_id text,
  current_media_name text,
  player_mode text,
  playback_issue text,
  updated_at timestamptz not null default now()
);
alter table public.grill_screens enable row level security;
revoke all on public.grill_screens from anon;
grant select on public.grill_screens to authenticated;
drop policy if exists grill_screens_head_office_read on public.grill_screens;
create policy grill_screens_head_office_read on public.grill_screens
for select to authenticated using ((select public.is_grill_admin()));
-- Writes are made exclusively by a server-side Edge Function using service role.
-- Never expose token_hash or a service-role credential in browser code.
-- Initial device pairing and token issuance are a separate controlled step.
