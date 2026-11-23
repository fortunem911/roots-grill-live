-- ROOTS GRILL CLOUD · SCREEN MANAGEMENT V2
-- Run once in Supabase SQL Editor BEFORE deploying screen-management V2.
-- Existing screens and pairing tokens remain intact.
alter table public.grill_screens
  add column if not exists location text,
  add column if not exists disabled boolean not null default false;
update public.grill_screens
set location=case
  when store_id='head-office' then 'Head Office'
  when store_id='home-test' then 'Home Test'
  else store_id
end
where location is null or btrim(location)='';
alter table public.grill_screens
  alter column location set not null;
-- Future branch manager permissions require explicit user-to-location access tables and RLS.
