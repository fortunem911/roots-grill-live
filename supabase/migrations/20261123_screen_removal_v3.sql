-- ROOTS GRILL CLOUD · SCREEN MANAGEMENT V3
-- Run once before deploying screen-management V3.
-- Deletes a screen registration and its related pairing requests atomically.
-- A removed physical TV can generate a new pairing code and be registered anew.
create or replace function public.grill_remove_screen(p_screen_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- This function must only be called by the authenticated Head Office Edge Function.
  if not exists(select 1 from public.grill_screens where id=p_screen_id) then
    return false;
  end if;
  delete from public.grill_pairing_requests where screen_id=p_screen_id;
  delete from public.grill_screens where id=p_screen_id;
  return true;
end;
$$;
revoke all on function public.grill_remove_screen(text) from public, anon, authenticated;
grant execute on function public.grill_remove_screen(text) to service_role;
