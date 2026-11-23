-- Roots Grill Cloud | Store Accounts V1: secure membership foundation
-- Run in Supabase SQL Editor. No changes to existing screen, media or pairing records.
-- Invitations are NOT sent by this migration; a protected server function will do that later.

create table if not exists public.grill_store_memberships (
  id uuid primary key default gen_random_uuid(),
  store_id text not null references public.grill_stores(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'manager' check (role in ('manager')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, user_id)
);
create index if not exists grill_store_memberships_user_idx
  on public.grill_store_memberships(user_id, active);

create table if not exists public.grill_store_invitations (
  id uuid primary key default gen_random_uuid(),
  store_id text not null references public.grill_stores(id) on delete cascade,
  email text not null,
  role text not null default 'manager' check (role in ('manager')),
  status text not null default 'pending' check (status in ('pending','accepted','revoked','expired')),
  invited_by uuid references auth.users(id) on delete set null,
  accepted_by uuid references auth.users(id) on delete set null,
  invited_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint grill_store_invitations_email_format check (
    length(email) between 3 and 254 and email = lower(btrim(email)) and position('@' in email) > 1
  )
);
create unique index if not exists grill_store_invitations_pending_unique
  on public.grill_store_invitations(store_id, email)
  where status = 'pending';
create index if not exists grill_store_invitations_store_idx
  on public.grill_store_invitations(store_id, invited_at desc);

alter table public.grill_store_memberships enable row level security;
alter table public.grill_store_invitations enable row level security;

-- Defense in depth: the frontend cannot directly list or modify memberships/invitations.
-- Protected Edge Functions will authorize Head Office and store-scoped operations.
revoke all on public.grill_store_memberships from anon, authenticated;
revoke all on public.grill_store_invitations from anon, authenticated;

comment on table public.grill_store_memberships is
  'Store-scoped account memberships; server-authorized access only.';
comment on table public.grill_store_invitations is
  'Invitation metadata, not invitation secrets. Email delivery and acceptance handled server-side.';

-- Verify:
-- select count(*) from public.grill_store_memberships;
-- select count(*) from public.grill_store_invitations;
