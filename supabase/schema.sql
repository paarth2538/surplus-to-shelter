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

create table if not exists public.drivers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles(id) on delete set null,
  name text not null,
  phone text,
  vehicle_type text,
  latitude double precision,
  longitude double precision,
  available boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.pickups (
  id uuid primary key default gen_random_uuid(),
  donation_id uuid references public.donations(id) on delete cascade,
  driver_id uuid references public.drivers(id) on delete set null,
  shelter_id uuid references public.shelters(id) on delete set null,
  pickup_time timestamptz,
  delivery_time timestamptz,
  status text not null default 'assigned' check (status in (
    'assigned', 'accepted', 'en_route', 'picked_up', 'delivered', 'cancelled'
  )),
  created_at timestamptz not null default now()
);

create table if not exists public.impact (
  id uuid primary key default gen_random_uuid(),
  donation_id uuid references public.donations(id) on delete cascade,
  weight_rescued numeric check (weight_rescued is null or weight_rescued >= 0),
  meals_rescued numeric check (meals_rescued is null or meals_rescued >= 0),
  co2e_avoided numeric check (co2e_avoided is null or co2e_avoided >= 0),
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

alter table public.profiles enable row level security;
alter table public.donations enable row level security;
alter table public.shelters enable row level security;
alter table public.drivers enable row level security;
alter table public.pickups enable row level security;
alter table public.impact enable row level security;

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
    where pu.donation_id = donation_uuid and d.profile_id = auth.uid()
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
    where pu.id = pickup_uuid and d.donor_id = auth.uid()
  )
  or exists (
    select 1
    from public.pickups pu
    join public.drivers dr on dr.id = pu.driver_id
    where pu.id = pickup_uuid and dr.profile_id = auth.uid()
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
    where pu.id = pickup_uuid and d.profile_id = auth.uid()
  );
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
grant execute on function public.is_profile_role(text) to authenticated;
grant execute on function public.owns_donation(uuid) to authenticated;
grant execute on function public.can_view_donation(uuid) to authenticated;
grant execute on function public.can_view_pickup(uuid) to authenticated;
grant execute on function public.is_assigned_driver(uuid) to authenticated;

create policy "Users can read their own profile"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()));

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

create policy "Drivers can read their own driver record"
  on public.drivers for select to authenticated
  using (profile_id = (select auth.uid()));

create policy "Driver users can create their own driver record"
  on public.drivers for insert to authenticated
  with check (
    profile_id = (select auth.uid())
    and public.is_profile_role('driver')
  );

create policy "Drivers can update their own driver record"
  on public.drivers for update to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

create policy "Relevant users can view pickups"
  on public.pickups for select to authenticated
  using (public.can_view_pickup(id));

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

create policy "Relevant users can view impact"
  on public.impact for select to authenticated
  using (
    public.owns_donation(donation_id)
    or public.is_profile_role('shelter')
    or public.is_profile_role('admin')
  );

create policy "Admins can create impact records"
  on public.impact for insert to authenticated
  with check (
    public.is_profile_role('admin')
  );