create extension if not exists pgcrypto;

create table if not exists public.pickup_requests (
  id uuid primary key default gen_random_uuid(),
  business_name text not null check (char_length(trim(business_name)) between 2 and 120),
  category text not null check (category in (
    'Fresh Produce',
    'Prepared Meals',
    'Bakery',
    'Warmth & Apparel',
    'Hygiene Kits'
  )),
  crates integer not null check (crates > 0 and crates <= 10000),
  address text not null check (char_length(trim(address)) between 5 and 300),
  status text not null default 'requested' check (status in ('requested', 'assigned', 'in_transit', 'completed', 'cancelled')),
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.pickup_requests enable row level security;

create policy "Anyone can submit pickup requests"
  on public.pickup_requests
  for insert
  to anon, authenticated
  with check (true);

create index if not exists pickup_requests_created_at_idx
  on public.pickup_requests (created_at desc);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  email text,
  phone text,
  role text not null default 'donor' check (role in ('donor', 'shelter', 'driver', 'admin')),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  requested_role text := new.raw_user_meta_data ->> 'role';
begin
  insert into public.profiles (id, name, email, phone, role)
  values (
    new.id,
    nullif(new.raw_user_meta_data ->> 'name', ''),
    new.email,
    nullif(new.raw_user_meta_data ->> 'phone', ''),
    case
      when requested_role in ('donor', 'shelter', 'driver') then requested_role
      else 'donor'
    end
  )
  on conflict (id) do update set
    email = excluded.email,
    name = coalesce(public.profiles.name, excluded.name),
    phone = coalesce(public.profiles.phone, excluded.phone);

  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'on_auth_user_created'
      and tgrelid = 'auth.users'::regclass
  ) then
    create trigger on_auth_user_created
      after insert on auth.users
      for each row execute function public.handle_new_user();
  end if;
end;
$$;

create table if not exists public.donations (
  id uuid primary key default gen_random_uuid(),
  donor_id uuid references public.profiles(id) on delete set null,
  food_name text not null,
  food_type text,
  description text,
  quantity numeric not null check (quantity > 0),
  unit text,
  pickup_address text,
  latitude double precision,
  longitude double precision,
  expiry_time timestamptz not null,
  status text not null default 'posted' check (status in (
    'posted', 'matched', 'pickup_assigned', 'picked_up', 'delivered', 'expired', 'cancelled'
  )),
  created_at timestamptz not null default now()
);

create table if not exists public.shelters (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles(id) on delete set null,
  organization_name text not null,
  contact_person text,
  phone text,
  address text,
  latitude double precision,
  longitude double precision,
  capacity numeric check (capacity is null or capacity >= 0),
  current_capacity numeric not null default 0 check (current_capacity >= 0),
  food_preferences text,
  urgency_level text not null default 'medium' check (urgency_level in ('low', 'medium', 'high', 'critical')),
  verified boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.shelter_requests (
  id uuid primary key default gen_random_uuid(),
  shelter_id uuid not null references public.shelters(id) on delete cascade,
  food_type text not null,
  item_name text not null,
  quantity numeric not null check (quantity > 0),
  unit text not null,
  description text,
  urgency_level text not null default 'medium' check (urgency_level in ('low', 'medium', 'high', 'critical')),
  needed_by timestamptz not null,
  status text not null default 'open' check (status in ('open', 'matched', 'fulfilled', 'cancelled', 'expired')),
  created_at timestamptz not null default now()
);

create or replace function public.prevent_shelter_verification_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.verified is distinct from new.verified and auth.role() <> 'service_role' then
    raise exception 'Shelter verification is managed by administrators';
  end if;
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'prevent_shelter_verification_change'
      and tgrelid = 'public.shelters'::regclass
  ) then
    create trigger prevent_shelter_verification_change
      before update on public.shelters
      for each row execute function public.prevent_shelter_verification_change();
  end if;
end;
$$;

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  donation_id uuid not null references public.donations(id) on delete cascade,
  shelter_request_id uuid not null references public.shelter_requests(id) on delete cascade,
  match_score numeric(5, 2) not null check (match_score >= 0 and match_score <= 100),
  distance_km numeric(10, 2),
  quantity_coverage numeric(5, 2) not null check (quantity_coverage >= 0 and quantity_coverage <= 100),
  urgency_level text not null check (urgency_level in ('low', 'medium', 'high', 'critical')),
  expiry_warning text not null default 'safe',
  status text not null default 'proposed' check (status in ('proposed', 'accepted', 'dismissed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (donation_id, shelter_request_id)
);
create table if not exists public.drivers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles(id) on delete set null,
  user_id uuid unique references public.profiles(id) on delete set null,
  name text not null,
  phone text,
  vehicle_type text,
  capacity_kg numeric check (capacity_kg is null or capacity_kg >= 0),
  latitude double precision,
  longitude double precision,
  current_lat double precision,
  current_lng double precision,
  available boolean not null default true,
  is_available boolean not null default true,
  status text not null default 'AVAILABLE' check (status in ('AVAILABLE', 'ASSIGNED', 'PICKUP', 'IN_TRANSIT', 'OFFLINE')),
  last_location_update timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.pickups (
  id uuid primary key default gen_random_uuid(),
  match_id uuid references public.matches(id) on delete set null,
  donation_id uuid references public.donations(id) on delete cascade,
  driver_id uuid references public.drivers(id) on delete set null,
  shelter_id uuid references public.shelters(id) on delete set null,
  pickup_time timestamptz,
  picked_up_at timestamptz,
  delivery_time timestamptz,
  delivered_at timestamptz,
  pickup_lat double precision,
  pickup_lng double precision,
  delivery_lat double precision,
  delivery_lng double precision,
  assigned_at timestamptz,
  pickup_verified_at timestamptz,
  delivery_verified_at timestamptz,
  proof_photo_url text,
  proof_signature_url text,
  delivery_proof_photo_url text,
  delivery_proof_signature_url text,
  temperature_c decimal(4,1),
  notes text,
  status text not null default 'ASSIGNED' check (status in ('ASSIGNED', 'PICKUP', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED')),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.drivers add column if not exists user_id uuid references public.profiles(id) on delete set null;
alter table public.drivers add column if not exists capacity_kg numeric check (capacity_kg is null or capacity_kg >= 0);
alter table public.drivers add column if not exists current_lat double precision;
alter table public.drivers add column if not exists current_lng double precision;
alter table public.drivers add column if not exists is_available boolean;
alter table public.drivers add column if not exists status text not null default 'AVAILABLE';
alter table public.drivers add column if not exists last_location_update timestamptz;
alter table public.drivers add column if not exists current_pickup_id uuid references public.pickups(id) on delete set null;

alter table public.pickups add column if not exists match_id uuid references public.matches(id) on delete set null;
alter table public.pickups add column if not exists picked_up_at timestamptz;
alter table public.pickups add column if not exists delivered_at timestamptz;
alter table public.pickups add column if not exists pickup_lat double precision;
alter table public.pickups add column if not exists pickup_lng double precision;
alter table public.pickups add column if not exists delivery_lat double precision;
alter table public.pickups add column if not exists delivery_lng double precision;
alter table public.pickups add column if not exists assigned_at timestamptz;
alter table public.pickups add column if not exists pickup_verified_at timestamptz;
alter table public.pickups add column if not exists delivery_verified_at timestamptz;
alter table public.pickups add column if not exists proof_photo_url text;
alter table public.pickups add column if not exists proof_signature_url text;
alter table public.pickups add column if not exists delivery_proof_photo_url text;
alter table public.pickups add column if not exists delivery_proof_signature_url text;
alter table public.pickups add column if not exists temperature_c decimal(4,1);
alter table public.pickups add column if not exists notes text;
alter table public.pickups add column if not exists updated_at timestamptz not null default now();

update public.drivers
set user_id = coalesce(user_id, profile_id),
    current_lat = coalesce(current_lat, latitude),
    current_lng = coalesce(current_lng, longitude),
    is_available = coalesce(is_available, available);

alter table public.drivers
  alter column is_available set default true,
  alter column is_available set not null;

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.pickups'::regclass and con.contype = 'c'
  loop
    execute format('alter table public.pickups drop constraint %I', constraint_name);
  end loop;
end;
$$;

update public.pickups
set status = case lower(status)
  when 'assigned' then 'ASSIGNED'
  when 'accepted' then 'ASSIGNED'
  when 'en_route' then 'IN_TRANSIT'
  when 'picked_up' then 'IN_TRANSIT'
  when 'delivered' then 'DELIVERED'
  when 'cancelled' then 'CANCELLED'
  else 'ASSIGNED'
end,
picked_up_at = coalesce(picked_up_at, pickup_time),
delivered_at = coalesce(delivered_at, delivery_time),
updated_at = coalesce(updated_at, created_at);

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.pickups'::regclass and con.contype = 'c'
  loop
    execute format('alter table public.pickups drop constraint %I', constraint_name);
  end loop;
end;
$$;

alter table public.pickups
  add constraint pickups_status_check
  check (status in ('ASSIGNED', 'PICKUP', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED'));

do $$
begin
  alter table public.matches drop constraint if exists matches_status_check;
exception
  when undefined_object then null;
end;
$$;

alter table public.matches
  add constraint matches_status_check
  check (status in ('proposed', 'accepted', 'dismissed'));

alter table public.drivers
  drop constraint if exists drivers_status_check;

alter table public.drivers
  add constraint drivers_status_check
  check (status in ('AVAILABLE', 'ASSIGNED', 'PICKUP', 'IN_TRANSIT', 'OFFLINE'));

create index if not exists matches_donation_id_idx on public.matches (donation_id);
create index if not exists matches_shelter_request_id_idx on public.matches (shelter_request_id);
create index if not exists pickups_driver_status_idx on public.pickups (driver_id, status);
create index if not exists pickups_pickup_time_idx on public.pickups (pickup_time);
create index if not exists pickups_match_idx on public.pickups (match_id);
create index if not exists drivers_status_idx on public.drivers (status);
create index if not exists drivers_user_id_idx on public.drivers (user_id);

create table if not exists public.impact (
  id uuid primary key default gen_random_uuid(),
  donation_id uuid references public.donations(id) on delete cascade,
  weight_rescued numeric check (weight_rescued is null or weight_rescued >= 0),
  meals_rescued numeric check (meals_rescued is null or meals_rescued >= 0),
  co2e_avoided numeric check (co2e_avoided is null or co2e_avoided >= 0),
  created_at timestamptz not null default now(),
  constraint impact_donation_id_key unique (donation_id)
);

create table if not exists public.notification_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  message text not null,
  data jsonb not null default '{}'::jsonb,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists donations_donor_id_idx on public.donations (donor_id);
create index if not exists donations_status_idx on public.donations (status);
create index if not exists donations_expiry_time_idx on public.donations (expiry_time);
create index if not exists shelters_verified_idx on public.shelters (verified);
create index if not exists shelters_urgency_level_idx on public.shelters (urgency_level);
create index if not exists shelters_latitude_idx on public.shelters (latitude);
create index if not exists shelters_longitude_idx on public.shelters (longitude);
create index if not exists drivers_available_idx on public.drivers (available);
create index if not exists pickups_status_idx on public.pickups (status);
create index if not exists pickups_donation_id_idx on public.pickups (donation_id);
create index if not exists pickups_driver_id_idx on public.pickups (driver_id);
create index if not exists pickups_shelter_id_idx on public.pickups (shelter_id);
create index if not exists impact_donation_id_idx on public.impact (donation_id);
create index if not exists shelter_requests_shelter_id_idx on public.shelter_requests (shelter_id);
create index if not exists shelter_requests_status_idx on public.shelter_requests (status);
create index if not exists shelter_requests_urgency_level_idx on public.shelter_requests (urgency_level);
create index if not exists shelter_requests_needed_by_idx on public.shelter_requests (needed_by);
create index if not exists notification_events_user_read_idx on public.notification_events (user_id, read, created_at desc);

alter table public.profiles enable row level security;
alter table public.donations enable row level security;
alter table public.shelters enable row level security;
alter table public.drivers enable row level security;
alter table public.pickups enable row level security;
alter table public.matches enable row level security;
alter table public.impact enable row level security;
alter table public.shelter_requests enable row level security;
alter table public.notification_events enable row level security;

create or replace function public.is_profile_role(required_role text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = required_role
  );
$$;

create or replace function public.owns_donation(donation_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.donations
    where id = donation_uuid and donor_id = auth.uid()
  );
$$;

create or replace function public.can_view_donation(donation_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.pickups pu
    join public.drivers d on d.id = pu.driver_id
    where pu.donation_id = donation_uuid
      and coalesce(d.user_id, d.profile_id) = auth.uid()
  );
$$;

create or replace function public.can_view_pickup(pickup_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.pickups pu
    join public.donations d on d.id = pu.donation_id
    where pu.id = pickup_uuid
      and d.donor_id = auth.uid()
  )
  or exists (
    select 1
    from public.pickups pu
    join public.drivers dr on dr.id = pu.driver_id
    where pu.id = pickup_uuid
      and coalesce(dr.user_id, dr.profile_id) = auth.uid()
  )
  or exists (
    select 1
    from public.pickups pu
    join public.shelters s on s.id = pu.shelter_id
    where pu.id = pickup_uuid and s.profile_id = auth.uid()
  )
  or public.is_profile_role('admin');
$$;

create or replace function public.is_assigned_driver(pickup_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.pickups pu
    join public.drivers d on d.id = pu.driver_id
    where pu.id = pickup_uuid
      and coalesce(d.user_id, d.profile_id) = auth.uid()
  );
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
  v_match_id uuid;
  v_old_status text;
begin
  select pu.driver_id, pu.match_id, pu.status
    into v_driver_id, v_match_id, v_old_status
  from public.pickups pu
  join public.drivers dr on dr.id = pu.driver_id
  where pu.id = p_pickup_id
    and coalesce(dr.user_id, dr.profile_id) = auth.uid();

  if not found then
    raise exception 'Unauthorized: not your pickup';
  end if;

  if not (
    (v_old_status = 'ASSIGNED' and p_new_status = 'PICKUP') or
    (v_old_status = 'PICKUP' and p_new_status = 'IN_TRANSIT') or
    (v_old_status = 'IN_TRANSIT' and p_new_status = 'DELIVERED') or
    (v_old_status in ('ASSIGNED', 'PICKUP', 'IN_TRANSIT') and p_new_status = 'CANCELLED')
  ) then
    raise exception 'Invalid status transition: % -> %', v_old_status, p_new_status;
  end if;

  update public.pickups
  set status = p_new_status,
      notes = coalesce(p_notes, notes),
      temperature_c = coalesce(p_temperature_c, temperature_c),
      proof_photo_url = coalesce(p_proof_photo_url, proof_photo_url),
      picked_up_at = case
        when p_new_status = 'PICKUP' then coalesce(picked_up_at, now())
        else picked_up_at
      end,
      delivered_at = case
        when p_new_status = 'DELIVERED' then coalesce(delivered_at, now())
        else delivered_at
      end,
      updated_at = now()
  where id = p_pickup_id;

  if p_lat is not null and p_lng is not null then
    update public.drivers
    set current_lat = p_lat,
        current_lng = p_lng,
        last_location_update = now()
    where id = v_driver_id;
  end if;

  if p_new_status in ('DELIVERED', 'CANCELLED') then
    update public.drivers
    set current_pickup_id = null,
        status = 'AVAILABLE',
        is_available = true,
        available = true
    where id = v_driver_id;

  elsif p_new_status = 'PICKUP' then
    update public.drivers set status = 'PICKUP' where id = v_driver_id;
  elsif p_new_status = 'IN_TRANSIT' then
    update public.drivers set status = 'IN_TRANSIT' where id = v_driver_id;
  end if;
end;
$$;

create or replace function public.prevent_profile_role_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role is distinct from new.role and auth.role() <> 'service_role' then
    raise exception 'Profile roles are managed by administrators';
  end if;
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'prevent_profile_role_change'
      and tgrelid = 'public.profiles'::regclass
  ) then
    create trigger prevent_profile_role_change
      before update on public.profiles
      for each row execute function public.prevent_profile_role_change();
  end if;
end;
$$;

revoke all on function public.is_profile_role(text) from public;
revoke all on function public.owns_donation(uuid) from public;
revoke all on function public.can_view_donation(uuid) from public;
revoke all on function public.can_view_pickup(uuid) from public;
revoke all on function public.is_assigned_driver(uuid) from public;
revoke all on function public.update_pickup_status(uuid, text, decimal, decimal, decimal, text, text) from public;
grant execute on function public.is_profile_role(text) to authenticated;
grant execute on function public.owns_donation(uuid) to authenticated;
grant execute on function public.can_view_donation(uuid) to authenticated;
grant execute on function public.can_view_pickup(uuid) to authenticated;
grant execute on function public.is_assigned_driver(uuid) to authenticated;
grant execute on function public.update_pickup_status(uuid, text, decimal, decimal, decimal, text, text) to authenticated;

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
begin
  if not public.is_profile_role('admin') then
    raise exception 'Unauthorized: admin access required';
  end if;

  if not exists (select 1 from public.drivers where id = p_driver_id and is_available = true and status = 'AVAILABLE' and current_pickup_id is null) then
    raise exception 'Driver is not available';
  end if;

  select m.donation_id, sr.shelter_id, m.status
    into v_donation_id, v_shelter_id, v_match_status
  from public.matches m
  join public.shelter_requests sr on sr.id = m.shelter_request_id
  where m.id = p_match_id;
  if not found then raise exception 'Match not found'; end if;
  if v_match_status <> 'accepted' then raise exception 'Match must be accepted before driver assignment'; end if;

  select id into v_pickup_id from public.pickups where match_id = p_match_id limit 1;
  if v_pickup_id is null then
    insert into public.pickups (match_id, donation_id, driver_id, shelter_id, status, assigned_at, pickup_time)
    select p_match_id, v_donation_id, p_driver_id, v_shelter_id, 'ASSIGNED', now(), p_scheduled_at
    from public.donations d where d.id = v_donation_id
    returning id into v_pickup_id;
  else
    update public.pickups set driver_id = p_driver_id, status = 'ASSIGNED', assigned_at = now(), pickup_time = coalesce(p_scheduled_at, pickup_time) where id = v_pickup_id;
  end if;

  update public.drivers set current_pickup_id = v_pickup_id, status = 'ASSIGNED', is_available = false, available = false where id = p_driver_id;
  return v_pickup_id;
end;
$$;

revoke all on function public.assign_driver_to_match(uuid, uuid, timestamptz) from public;
grant execute on function public.assign_driver_to_match(uuid, uuid, timestamptz) to authenticated;

create policy "Users can read their own profile"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

create policy "Drivers can view assigned pickup donor profiles"
  on public.profiles for select to authenticated
  using (
    exists (
      select 1
      from public.pickups pu
      join public.drivers dr on dr.id = pu.driver_id
      left join public.donations dn on dn.id = pu.donation_id
      where coalesce(dr.user_id, dr.profile_id) = (select auth.uid())
        and dn.donor_id = public.profiles.id
    )
  );

create policy "Users can create their own profile"
  on public.profiles for insert to authenticated
  with check (id = (select auth.uid()) and role = 'donor');

create policy "Users can update their own profile"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "Donors can create their own donations"
  on public.donations for insert to authenticated
  with check (
    donor_id = (select auth.uid())
    and public.is_profile_role('donor')
  );

create policy "Relevant users can view donations"
  on public.donations for select to authenticated
  using (
    donor_id = (select auth.uid())
    or public.is_profile_role('shelter')
    or public.is_profile_role('admin')
    or public.can_view_donation(id)
  );

create policy "Donors can update their own donations"
  on public.donations for update to authenticated
  using (donor_id = (select auth.uid()))
  with check (donor_id = (select auth.uid()));

create policy "Authenticated users can view verified shelters"
  on public.shelters for select to authenticated
  using (verified = true or profile_id = (select auth.uid()));

create policy "Shelter users can create their own shelter"
  on public.shelters for insert to authenticated
  with check (
    profile_id = (select auth.uid())
    and public.is_profile_role('shelter')
  );

create policy "Shelter users can update their own shelter"
  on public.shelters for update to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

create policy "Shelters can view their own requests"
  on public.shelter_requests for select to authenticated
  using (
    exists (
      select 1 from public.shelters s
      where s.id = shelter_id and s.profile_id = (select auth.uid())
    )
  );

create policy "Shelters can create their own requests"
  on public.shelter_requests for insert to authenticated
  with check (
    public.is_profile_role('shelter')
    and exists (
      select 1 from public.shelters s
      where s.id = shelter_id and s.profile_id = (select auth.uid())
    )
  );

create policy "Shelters can update their open requests"
  on public.shelter_requests for update to authenticated
  using (
    status = 'open'
    and exists (
      select 1 from public.shelters s
      where s.id = shelter_id and s.profile_id = (select auth.uid())
    )
  )
  with check (
    status in ('open', 'cancelled')
    and exists (
      select 1 from public.shelters s
      where s.id = shelter_id and s.profile_id = (select auth.uid())
    )
  );

create policy "Drivers can read their own driver record"
  on public.drivers for select to authenticated
  using (coalesce(user_id, profile_id) = (select auth.uid()));

create policy "Driver users can create their own driver record"
  on public.drivers for insert to authenticated
  with check (
    profile_id = (select auth.uid())
    and public.is_profile_role('driver')
  );

create policy "Drivers can update their own driver record"
  on public.drivers for update to authenticated
  using (coalesce(user_id, profile_id) = (select auth.uid()))
  with check (coalesce(user_id, profile_id) = (select auth.uid()));

create policy "Relevant users can view pickups"
  on public.pickups for select to authenticated
  using (public.can_view_pickup(id));

create policy "Drivers view assigned pickups"
  on public.pickups for select to authenticated
  using (
    public.can_view_pickup(id)
  );

create policy "Donors and admins can create pickups"
  on public.pickups for insert to authenticated
  with check (
    public.owns_donation(donation_id)
    or public.is_profile_role('admin')
  );

create policy "Assigned drivers can update pickups"
  on public.pickups for update to authenticated
  using (
    public.is_assigned_driver(id)
    or public.is_profile_role('admin')
  )
  with check (
    public.is_assigned_driver(id)
    or public.is_profile_role('admin')
  );

create policy "Drivers update assigned pickups"
  on public.pickups for update to authenticated
  using (public.is_assigned_driver(id))
  with check (public.is_assigned_driver(id));

create policy "System creates pickups"
  on public.pickups for insert to service_role
  with check (true);

create policy "Relevant users can view matches"
  on public.matches for select to authenticated
  using (
    exists (
      select 1 from public.donations d
      where d.id = donation_id and d.donor_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.shelter_requests sr
      join public.shelters s on s.id = sr.shelter_id
      where sr.id = shelter_request_id and s.profile_id = (select auth.uid())
    )
    or public.is_profile_role('admin')
  );

create policy "Relevant users can view impact"
  on public.impact for select to authenticated
  using (
    public.owns_donation(donation_id)
    or public.is_profile_role('admin')
    or exists (
      select 1
      from public.pickups pu
      join public.drivers dr on dr.id = pu.driver_id
      where pu.donation_id = public.impact.donation_id
        and coalesce(dr.user_id, dr.profile_id) = auth.uid()
    )
    or exists (
      select 1
      from public.pickups pu
      join public.shelters sh on sh.id = pu.shelter_id
      where pu.donation_id = public.impact.donation_id
        and sh.profile_id = auth.uid()
    )
  );

create policy "Admins can create impact records"
  on public.impact for insert to authenticated
  with check (
    public.is_profile_role('admin')
  );

create policy "Users can view their own notifications"
  on public.notification_events for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Users can update their own notifications"
  on public.notification_events for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create or replace function public.notify_pickup_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  status_message text;
begin
  if old.status is not distinct from new.status then
    return new;
  end if;

  status_message := format('Pickup %s is now %s.', left(new.id::text, 8), replace(new.status, '_', ' '));

  insert into public.notification_events (user_id, type, title, message, data)
  select recipients.user_id,
         'pickup_status_changed',
         'Pickup status updated',
         status_message,
         jsonb_build_object('pickup_id', new.id, 'status', new.status, 'previous_status', old.status)
  from (
    select coalesce(dr.user_id, dr.profile_id) as user_id
    from public.drivers dr
    where dr.id = new.driver_id
    union
    select dn.donor_id as user_id
    from public.donations dn
    where dn.id = new.donation_id
    union
    select sh.profile_id as user_id
    from public.shelters sh
    where sh.id = new.shelter_id
  ) recipients
  where recipients.user_id is not null;

  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'pickup_status_notification_trigger'
      and tgrelid = 'public.pickups'::regclass
  ) then
    create trigger pickup_status_notification_trigger
      after update of status on public.pickups
      for each row execute function public.notify_pickup_status_change();
  end if;
end;
$$;

-- Phase 8: Automatic impact recording on delivery
create or replace function public.handle_pickup_delivery_impact()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_donation record;
  v_weight numeric := null;
  v_meals numeric := null;
  v_co2e numeric := null;
  v_unit text;
begin
  if NEW.status = 'DELIVERED' and (TG_OP = 'INSERT' or OLD.status is distinct from 'DELIVERED') then
    select * into v_donation
    from public.donations
    where id = NEW.donation_id;

    if found then
      v_unit := lower(trim(coalesce(v_donation.unit, '')));

      if v_unit in ('kg', 'kgs', 'kilogram', 'kilograms') then
        v_weight := v_donation.quantity;
      elsif v_unit in ('g', 'gm', 'gram', 'grams') then
        v_weight := round((v_donation.quantity / 1000.0)::numeric, 3);
      elsif v_unit in ('lb', 'lbs', 'pound', 'pounds') then
        v_weight := round((v_donation.quantity * 0.45359237)::numeric, 2);
      elsif v_unit in ('oz', 'ounce', 'ounces') then
        v_weight := round((v_donation.quantity * 0.0283495)::numeric, 3);
      else
        v_weight := null;
      end if;

      if v_unit in ('meal', 'meals', 'serving', 'servings', 'portion', 'portions') then
        v_meals := v_donation.quantity;
      elsif v_weight is not null and v_weight > 0 then
        v_meals := round((v_weight / 0.42)::numeric, 1);
      else
        v_meals := null;
      end if;

      if v_weight is not null and v_weight > 0 then
        v_co2e := round((v_weight * 2.5)::numeric, 2);
      else
        v_co2e := null;
      end if;

      insert into public.impact (donation_id, weight_rescued, meals_rescued, co2e_avoided, created_at)
      values (NEW.donation_id, v_weight, v_meals, v_co2e, coalesce(NEW.delivered_at, now()))
      on conflict (donation_id) do nothing;
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists trg_pickup_delivery_impact on public.pickups;
create trigger trg_pickup_delivery_impact
  after insert or update on public.pickups
  for each row
  execute function public.handle_pickup_delivery_impact();

create index if not exists impact_created_at_idx on public.impact (created_at desc);

-- Phase 8: Public aggregate metrics function
create or replace function public.get_public_impact_metrics()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result json;
begin
  select json_build_object(
    'total_deliveries', coalesce(count(distinct pu.id), 0),
    'total_weight_kg', coalesce(sum(imp.weight_rescued), 0),
    'total_meals', coalesce(sum(imp.meals_rescued), 0),
    'total_co2e_avoided', coalesce(sum(imp.co2e_avoided), 0),
    'shelters_served', coalesce(count(distinct pu.shelter_id), 0),
    'active_donors', coalesce(count(distinct dn.donor_id), 0),
    'active_drivers', coalesce(count(distinct pu.driver_id), 0)
  )
  into v_result
  from public.pickups pu
  join public.donations dn on dn.id = pu.donation_id
  left join public.impact imp on imp.donation_id = dn.id
  where pu.status = 'DELIVERED';

  return coalesce(v_result, '{}'::json);
end;
$$;

revoke all on function public.get_public_impact_metrics() from public;
grant execute on function public.get_public_impact_metrics() to anon, authenticated;