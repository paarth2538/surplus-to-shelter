-- Phase 7 live tracking using the existing driver location fields.

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'drivers'
    ) then
      execute 'alter publication supabase_realtime add table public.drivers';
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'pickups'
    ) then
      execute 'alter publication supabase_realtime add table public.pickups';
    end if;
  end if;
end;
$$;

create or replace function public.update_driver_location(
  p_lat double precision,
  p_lng double precision,
  p_accuracy double precision default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  driver_id uuid;
  pickup_status text;
begin
  if p_lat is null or p_lng is null
    or p_lat < -90 or p_lat > 90
    or p_lng < -180 or p_lng > 180 then
    raise exception 'Invalid location coordinates';
  end if;

  if p_accuracy is not null and (p_accuracy < 0 or p_accuracy > 100000) then
    raise exception 'Invalid location accuracy';
  end if;

  select dr.id, pu.status
    into driver_id, pickup_status
  from public.drivers dr
  left join public.pickups pu on pu.id = dr.current_pickup_id
  where coalesce(dr.user_id, dr.profile_id) = auth.uid()
  for update;

  if not found then
    raise exception 'Driver profile not found';
  end if;

  if pickup_status not in ('PICKUP', 'IN_TRANSIT') then
    raise exception 'Location sharing requires an active pickup';
  end if;

  update public.drivers
  set current_lat = p_lat,
      current_lng = p_lng,
      last_location_update = now()
  where id = driver_id;
end;
$$;

revoke all on function public.update_driver_location(double precision, double precision, double precision) from public;
grant execute on function public.update_driver_location(double precision, double precision, double precision) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'drivers'
      and policyname = 'Participants can view active driver locations'
  ) then
    create policy "Participants can view active driver locations"
      on public.drivers for select to authenticated
      using (
        exists (
          select 1
          from public.pickups pu
          left join public.donations dn on dn.id = pu.donation_id
          left join public.shelters sh on sh.id = pu.shelter_id
          where pu.driver_id = public.drivers.id
            and pu.status in ('ASSIGNED', 'PICKUP', 'IN_TRANSIT')
            and (
              dn.donor_id = (select auth.uid())
              or sh.profile_id = (select auth.uid())
            )
        )
      );
  end if;
end;
$$;
