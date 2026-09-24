-- Phase 6 hardening for the live Phase 5 matches contract.

create unique index if not exists pickups_match_id_unique
  on public.pickups (match_id)
  where match_id is not null;

insert into storage.buckets (id, name, public)
values ('pickup-proofs', 'pickup-proofs', true)
on conflict (id) do update set public = excluded.public;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Drivers can upload pickup proof'
  ) then
    create policy "Drivers can upload pickup proof"
      on storage.objects for insert to authenticated
      with check (
        bucket_id = 'pickup-proofs'
        and exists (
          select 1
          from public.pickups pu
          join public.drivers dr on dr.id = pu.driver_id
          where pu.id::text = split_part(name, '/', 1)
            and coalesce(dr.user_id, dr.profile_id) = (select auth.uid())
        )
      );
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'drivers'
      and policyname = 'Admins can view drivers'
  ) then
    create policy "Admins can view drivers"
      on public.drivers for select to authenticated
      using (public.is_profile_role('admin'));
  end if;
end;
$$;

create or replace function public.respond_to_match(p_match_id uuid, p_status text)
returns public.matches
language plpgsql
security definer
set search_path = public
as $$
declare
  match_row public.matches;
  donation_status text;
begin
  if p_status not in ('accepted', 'dismissed') then
    raise exception 'Invalid match response';
  end if;

  select * into match_row
  from public.matches
  where id = p_match_id
  for update;

  if not found or match_row.status <> 'proposed' then
    raise exception 'Match is no longer actionable';
  end if;

  if not (
    exists (
      select 1 from public.donations
      where id = match_row.donation_id and donor_id = auth.uid()
    )
    or exists (
      select 1
      from public.shelter_requests sr
      join public.shelters s on s.id = sr.shelter_id
      where sr.id = match_row.shelter_request_id and s.profile_id = auth.uid()
    )
    or public.is_profile_role('admin')
  ) then
    raise exception 'Not authorized to respond to this match';
  end if;

  if p_status = 'accepted' then
    select status into donation_status
    from public.donations
    where id = match_row.donation_id
    for update;

    if donation_status not in ('posted', 'matched') then
      raise exception 'This donation is no longer available';
    end if;

    update public.matches
    set status = 'accepted', updated_at = now()
    where id = p_match_id;

    update public.donations
    set status = 'matched'
    where id = match_row.donation_id;

    insert into public.pickups (match_id, donation_id, shelter_id, status)
    select match_row.id, match_row.donation_id, sr.shelter_id, 'ASSIGNED'
    from public.shelter_requests sr
    where sr.id = match_row.shelter_request_id
    on conflict (match_id) do nothing;
  else
    update public.matches
    set status = 'dismissed', updated_at = now()
    where id = p_match_id;
  end if;

  select * into match_row from public.matches where id = p_match_id;
  return match_row;
end;
$$;

create or replace function public.assign_driver_to_match(
  p_match_id uuid,
  p_driver_id uuid,
  p_scheduled_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pickup_id uuid;
  v_donation_id uuid;
  v_shelter_id uuid;
  v_match_status text;
  v_driver_id uuid;
begin
  if not public.is_profile_role('admin') then
    raise exception 'Unauthorized: admin access required';
  end if;

  select m.donation_id, sr.shelter_id, m.status
    into v_donation_id, v_shelter_id, v_match_status
  from public.matches m
  join public.shelter_requests sr on sr.id = m.shelter_request_id
  where m.id = p_match_id
  for update;

  if not found then
    raise exception 'Match not found';
  end if;
  if v_match_status <> 'accepted' then
    raise exception 'Match must be accepted before driver assignment';
  end if;

  select id into v_driver_id
  from public.drivers
  where id = p_driver_id
    and is_available = true
    and available = true
    and status = 'AVAILABLE'
    and current_pickup_id is null
  for update;

  if not found then
    raise exception 'Driver is no longer available';
  end if;

  select id into v_pickup_id
  from public.pickups
  where match_id = p_match_id
  for update;

  if v_pickup_id is null then
    insert into public.pickups (match_id, donation_id, driver_id, shelter_id, status, assigned_at, pickup_time)
    values (p_match_id, v_donation_id, p_driver_id, v_shelter_id, 'ASSIGNED', now(), p_scheduled_at)
    returning id into v_pickup_id;
  else
    update public.pickups
    set driver_id = p_driver_id,
        shelter_id = v_shelter_id,
        status = 'ASSIGNED',
        assigned_at = now(),
        pickup_time = coalesce(p_scheduled_at, pickup_time),
        updated_at = now()
    where id = v_pickup_id;
  end if;

  update public.drivers
  set current_pickup_id = v_pickup_id,
      status = 'ASSIGNED',
      is_available = false,
      available = false
  where id = p_driver_id;

  update public.donations
  set status = 'pickup_assigned'
  where id = v_donation_id and status in ('posted', 'matched', 'pickup_assigned');

  return v_pickup_id;
end;
$$;

create or replace function public.update_pickup_status(
  p_pickup_id uuid,
  p_new_status text,
  p_lat decimal(10,7) default null,
  p_lng decimal(10,7) default null,
  p_temperature_c decimal(4,1) default null,
  p_proof_photo_url text default null,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_driver_id uuid;
  v_donation_id uuid;
  v_old_status text;
begin
  select pu.driver_id, pu.donation_id, pu.status
    into v_driver_id, v_donation_id, v_old_status
  from public.pickups pu
  join public.drivers dr on dr.id = pu.driver_id
  where pu.id = p_pickup_id
    and coalesce(dr.user_id, dr.profile_id) = auth.uid()
  for update;

  if not found then
    raise exception 'Unauthorized: not your pickup';
  end if;

  if not (
    (v_old_status = 'ASSIGNED' and p_new_status = 'PICKUP') or
    (v_old_status = 'PICKUP' and p_new_status = 'IN_TRANSIT') or
    (v_old_status = 'IN_TRANSIT' and p_new_status = 'DELIVERED') or
    (v_old_status in ('ASSIGNED', 'PICKUP', 'IN_TRANSIT') and p_new_status = 'CANCELLED')
  ) then
    raise exception 'Invalid status transition';
  end if;

  update public.pickups
  set status = p_new_status,
      notes = coalesce(p_notes, notes),
      temperature_c = coalesce(p_temperature_c, temperature_c),
      proof_photo_url = coalesce(p_proof_photo_url, proof_photo_url),
      picked_up_at = case when p_new_status = 'PICKUP' then coalesce(picked_up_at, now()) else picked_up_at end,
      delivered_at = case when p_new_status = 'DELIVERED' then coalesce(delivered_at, now()) else delivered_at end,
      updated_at = now()
  where id = p_pickup_id;

  if p_new_status = 'PICKUP' then
    update public.donations set status = 'picked_up' where id = v_donation_id and status in ('pickup_assigned', 'matched');
    update public.drivers set status = 'PICKUP' where id = v_driver_id;
  elsif p_new_status = 'IN_TRANSIT' then
    update public.drivers set status = 'IN_TRANSIT' where id = v_driver_id;
  elsif p_new_status in ('DELIVERED', 'CANCELLED') then
    if p_new_status = 'DELIVERED' then
      update public.donations set status = 'delivered' where id = v_donation_id and status in ('pickup_assigned', 'picked_up');
    end if;
    update public.drivers
    set current_pickup_id = null,
        status = 'AVAILABLE',
        is_available = true,
        available = true
    where id = v_driver_id;
  end if;

  if p_lat is not null and p_lng is not null then
    update public.drivers
    set current_lat = p_lat, current_lng = p_lng, last_location_update = now()
    where id = v_driver_id;
  end if;
end;
$$;

revoke all on function public.respond_to_match(uuid, text) from public;
revoke all on function public.assign_driver_to_match(uuid, uuid, timestamptz) from public;
revoke all on function public.update_pickup_status(uuid, text, decimal, decimal, decimal, text, text) from public;
grant execute on function public.respond_to_match(uuid, text) to authenticated;
grant execute on function public.assign_driver_to_match(uuid, uuid, timestamptz) to authenticated;
grant execute on function public.update_pickup_status(uuid, text, decimal, decimal, decimal, text, text) to authenticated;

create or replace function public.admin_update_pickup_status(
  p_pickup_id uuid,
  p_new_status text,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  pickup_row public.pickups;
begin
  if not public.is_profile_role('admin') then
    raise exception 'Unauthorized: admin access required';
  end if;

  select * into pickup_row
  from public.pickups
  where id = p_pickup_id
  for update;

  if not found then
    raise exception 'Pickup not found';
  end if;

  if p_new_status <> pickup_row.status and not (
    (pickup_row.status = 'ASSIGNED' and p_new_status = 'PICKUP') or
    (pickup_row.status = 'PICKUP' and p_new_status = 'IN_TRANSIT') or
    (pickup_row.status = 'IN_TRANSIT' and p_new_status = 'DELIVERED') or
    (pickup_row.status in ('ASSIGNED', 'PICKUP', 'IN_TRANSIT') and p_new_status = 'CANCELLED')
  ) then
    raise exception 'Invalid status transition';
  end if;

  update public.pickups
  set status = p_new_status,
      notes = coalesce(p_notes, notes),
      picked_up_at = case when p_new_status = 'PICKUP' then coalesce(picked_up_at, now()) else picked_up_at end,
      delivered_at = case when p_new_status = 'DELIVERED' then coalesce(delivered_at, now()) else delivered_at end,
      updated_at = now()
  where id = p_pickup_id;

  if p_new_status = 'PICKUP' then
    update public.donations set status = 'picked_up' where id = pickup_row.donation_id and status in ('pickup_assigned', 'matched');
  elsif p_new_status = 'DELIVERED' then
    update public.donations set status = 'delivered' where id = pickup_row.donation_id and status in ('pickup_assigned', 'picked_up');
  end if;

  if p_new_status in ('DELIVERED', 'CANCELLED') and pickup_row.driver_id is not null then
    update public.drivers
    set current_pickup_id = null, status = 'AVAILABLE', is_available = true, available = true
    where id = pickup_row.driver_id;
  end if;
end;
$$;

revoke all on function public.admin_update_pickup_status(uuid, text, text) from public;
grant execute on function public.admin_update_pickup_status(uuid, text, text) to authenticated;
