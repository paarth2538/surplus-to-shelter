-- =========================================================================
-- COMPLETE SUPABASE SCHEMA REPAIR & SYNC SCRIPT
-- Surplus2Shelter (Surplus-to-Shelter)
-- Idempotent script: Safe to run multiple times without data loss or errors.
-- =========================================================================

-- Enable required extensions
create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";

-- 1. PROFILES TABLE
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  email text,
  phone text,
  role text not null default 'donor' check (role in ('donor', 'shelter', 'driver', 'admin')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- 2. SHELTERS TABLE
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

alter table public.shelters enable row level security;

-- 3. DONATIONS TABLE & MISSING COLUMNS
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

alter table public.donations
  add column if not exists donor_id uuid references public.profiles(id) on delete set null,
  add column if not exists food_name text,
  add column if not exists food_type text,
  add column if not exists description text,
  add column if not exists quantity numeric check (quantity is null or quantity > 0),
  add column if not exists unit text,
  add column if not exists pickup_address text,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists expiry_time timestamptz,
  add column if not exists status text default 'posted',
  add column if not exists created_at timestamptz default now(),
  add column if not exists ai_estimated boolean not null default false,
  add column if not exists ai_metadata jsonb default null,
  add column if not exists expiry_risk text check (expiry_risk in ('low', 'medium', 'high', 'critical')) default null;

create index if not exists donations_expiry_risk_idx on public.donations (expiry_risk);
alter table public.donations enable row level security;

-- 4. SHELTER REQUESTS TABLE
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

alter table public.shelter_requests enable row level security;

-- 5. MATCHES TABLE
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
  updated_at timestamptz not null default now()
);

alter table public.matches enable row level security;

-- 6. DRIVERS TABLE & MISSING COLUMNS
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

alter table public.drivers
  add column if not exists profile_id uuid unique references public.profiles(id) on delete set null,
  add column if not exists user_id uuid unique references public.profiles(id) on delete set null,
  add column if not exists name text,
  add column if not exists phone text,
  add column if not exists vehicle_type text,
  add column if not exists capacity_kg numeric,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists current_lat double precision,
  add column if not exists current_lng double precision,
  add column if not exists available boolean not null default true,
  add column if not exists is_available boolean not null default true,
  add column if not exists status text not null default 'AVAILABLE',
  add column if not exists last_location_update timestamptz,
  add column if not exists created_at timestamptz not null default now();

alter table public.drivers enable row level security;

-- 7. PICKUPS TABLE & MISSING COLUMNS
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

alter table public.pickups
  add column if not exists match_id uuid references public.matches(id) on delete set null,
  add column if not exists donation_id uuid references public.donations(id) on delete cascade,
  add column if not exists driver_id uuid references public.drivers(id) on delete set null,
  add column if not exists shelter_id uuid references public.shelters(id) on delete set null,
  add column if not exists pickup_time timestamptz,
  add column if not exists picked_up_at timestamptz,
  add column if not exists delivery_time timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists pickup_lat double precision,
  add column if not exists pickup_lng double precision,
  add column if not exists delivery_lat double precision,
  add column if not exists delivery_lng double precision,
  add column if not exists assigned_at timestamptz,
  add column if not exists pickup_verified_at timestamptz,
  add column if not exists delivery_verified_at timestamptz,
  add column if not exists proof_photo_url text,
  add column if not exists proof_signature_url text,
  add column if not exists delivery_proof_photo_url text,
  add column if not exists delivery_proof_signature_url text,
  add column if not exists temperature_c decimal(4,1),
  add column if not exists notes text,
  add column if not exists status text not null default 'ASSIGNED',
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists created_at timestamptz not null default now();

alter table public.pickups enable row level security;

-- 8. IMPACT TABLE
create table if not exists public.impact (
  id uuid primary key default gen_random_uuid(),
  donation_id uuid references public.donations(id) on delete cascade,
  weight_rescued numeric check (weight_rescued is null or weight_rescued >= 0),
  meals_rescued numeric check (meals_rescued is null or meals_rescued >= 0),
  co2e_avoided numeric check (co2e_avoided is null or co2e_avoided >= 0),
  created_at timestamptz not null default now()
);

alter table public.impact enable row level security;

-- 9. NOTIFICATION_EVENTS & NOTIFICATION_PREFERENCES
create table if not exists public.notification_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  message text not null,
  related_entity_type text,
  related_entity_id uuid,
  idempotency_key text,
  data jsonb not null default '{}'::jsonb,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.notification_events enable row level security;

create table if not exists public.notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  in_app boolean not null default true,
  email_enabled boolean not null default false,
  telegram_enabled boolean not null default false,
  telegram_chat_id text,
  urgent_alerts boolean not null default true,
  updated_at timestamptz not null default now()
);

alter table public.notification_preferences enable row level security;


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
  related_entity_type text,
  related_entity_id uuid,
  idempotency_key text,
  data jsonb not null default '{}'::jsonb,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.notification_preferences (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  in_app boolean not null default true,
  email_enabled boolean not null default false,
  telegram_enabled boolean not null default false,
  telegram_chat_id text,
  urgent_alerts boolean not null default true,
  updated_at timestamptz not null default now()
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

create policy "Admins can view all notifications"
  on public.notification_events for select to authenticated
  using (public.is_profile_role('admin'));

alter table public.notification_preferences enable row level security;

create policy "Users manage own notification preferences"
  on public.notification_preferences for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Phase 9: Secure notification creation RPC
create or replace function public.create_notification(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_message text,
  p_related_entity_type text default null,
  p_related_entity_id uuid default null,
  p_idempotency_key text default null,
  p_data jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_notification_id uuid;
begin
  if p_user_id is null or p_title is null or p_message is null or p_type is null then
    return null;
  end if;

  insert into public.notification_events (
    user_id,
    type,
    title,
    message,
    related_entity_type,
    related_entity_id,
    idempotency_key,
    data
  )
  values (
    p_user_id,
    p_type,
    p_title,
    p_message,
    p_related_entity_type,
    p_related_entity_id,
    p_idempotency_key,
    coalesce(p_data, '{}'::jsonb)
  )
  on conflict (user_id, idempotency_key) do nothing
  returning id into v_notification_id;

  return v_notification_id;
end;
$$;

revoke all on function public.create_notification(uuid, text, text, text, text, uuid, text, jsonb) from public;
grant execute on function public.create_notification(uuid, text, text, text, text, uuid, text, jsonb) to authenticated;

-- Phase 9: Role-aware pickup notification trigger
create or replace function public.notify_pickup_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_donation record;
  v_shelter record;
  v_driver record;
  v_driver_user_id uuid := null;
  v_unit text;
begin
  if (TG_OP = 'UPDATE' and old.status is not distinct from new.status) then
    return new;
  end if;

  select * into v_donation from public.donations where id = new.donation_id;
  select * into v_shelter from public.shelters where id = new.shelter_id;
  if new.driver_id is not null then
    select * into v_driver from public.drivers where id = new.driver_id;
    v_driver_user_id := coalesce(v_driver.user_id, v_driver.profile_id);
  end if;

  v_unit := coalesce(v_donation.unit, 'units');

  if new.status = 'ASSIGNED' then
    if v_driver_user_id is not null then
      perform public.create_notification(
        v_driver_user_id,
        'PICKUP_ASSIGNED',
        'New Pickup Route Assigned',
        format('Collect %s (%s %s) from %s for %s.', coalesce(v_donation.food_name, 'cargo'), coalesce(v_donation.quantity, 0), v_unit, coalesce(v_donation.pickup_address, 'donor address'), coalesce(v_shelter.organization_name, 'shelter')),
        'pickup',
        new.id,
        format('pickup_%s_assigned_driver_%s', new.id, v_driver_user_id),
        jsonb_build_object('pickup_id', new.id, 'status', new.status)
      );
    end if;

    if v_donation.donor_id is not null then
      perform public.create_notification(
        v_donation.donor_id,
        'PICKUP_ASSIGNED',
        'Driver Assigned to Your Donation',
        format('Courier %s has been assigned to collect your %s donation.', coalesce(v_driver.name, 'Courier'), coalesce(v_donation.food_name, 'surplus food')),
        'pickup',
        new.id,
        format('pickup_%s_assigned_donor_%s', new.id, v_donation.donor_id),
        jsonb_build_object('pickup_id', new.id, 'status', new.status)
      );
    end if;

    if v_shelter.profile_id is not null then
      perform public.create_notification(
        v_shelter.profile_id,
        'PICKUP_ASSIGNED',
        'Delivery Scheduled',
        format('A courier has been dispatched to collect %s for your shelter.', coalesce(v_donation.food_name, 'surplus items')),
        'pickup',
        new.id,
        format('pickup_%s_assigned_shelter_%s', new.id, v_shelter.profile_id),
        jsonb_build_object('pickup_id', new.id, 'status', new.status)
      );
    end if;

  elsif new.status = 'PICKUP' then
    if v_donation.donor_id is not null then
      perform public.create_notification(
        v_donation.donor_id,
        'FOOD_PICKED_UP',
        'Donation Picked Up',
        format('Courier %s has arrived and picked up your %s donation.', coalesce(v_driver.name, 'Courier'), coalesce(v_donation.food_name, 'surplus food')),
        'pickup',
        new.id,
        format('pickup_%s_pickup_donor_%s', new.id, v_donation.donor_id),
        jsonb_build_object('pickup_id', new.id, 'status', new.status)
      );
    end if;

    if v_shelter.profile_id is not null then
      perform public.create_notification(
        v_shelter.profile_id,
        'FOOD_PICKED_UP',
        'Courier Collected Food',
        format('Courier is now carrying %s (%s %s) to your shelter.', coalesce(v_donation.food_name, 'cargo'), coalesce(v_donation.quantity, 0), v_unit),
        'pickup',
        new.id,
        format('pickup_%s_pickup_shelter_%s', new.id, v_shelter.profile_id),
        jsonb_build_object('pickup_id', new.id, 'status', new.status)
      );
    end if;

  elsif new.status = 'IN_TRANSIT' then
    if v_shelter.profile_id is not null then
      perform public.create_notification(
        v_shelter.profile_id,
        'DRIVER_EN_ROUTE',
        'Delivery En Route',
        format('Your food delivery of %s is en route! Prepare your intake team.', coalesce(v_donation.food_name, 'surplus food')),
        'pickup',
        new.id,
        format('pickup_%s_intransit_shelter_%s', new.id, v_shelter.profile_id),
        jsonb_build_object('pickup_id', new.id, 'status', new.status)
      );
    end if;

    if v_donation.donor_id is not null then
      perform public.create_notification(
        v_donation.donor_id,
        'DRIVER_EN_ROUTE',
        'Donation En Route to Shelter',
        format('Your %s donation is currently on the road to %s.', coalesce(v_donation.food_name, 'food'), coalesce(v_shelter.organization_name, 'shelter')),
        'pickup',
        new.id,
        format('pickup_%s_intransit_donor_%s', new.id, v_donation.donor_id),
        jsonb_build_object('pickup_id', new.id, 'status', new.status)
      );
    end if;

  elsif new.status = 'DELIVERED' then
    if v_donation.donor_id is not null then
      perform public.create_notification(
        v_donation.donor_id,
        'DELIVERY_COMPLETED',
        'Donation Delivered Successfully! 🎉',
        format('Your %s (%s %s) was safely delivered to %s. View your impact dashboard to see waste diverted!', coalesce(v_donation.food_name, 'surplus food'), coalesce(v_donation.quantity, 0), v_unit, coalesce(v_shelter.organization_name, 'the shelter')),
        'pickup',
        new.id,
        format('pickup_%s_delivered_donor_%s', new.id, v_donation.donor_id),
        jsonb_build_object('pickup_id', new.id, 'status', new.status, 'donation_id', new.donation_id)
      );
    end if;

    if v_shelter.profile_id is not null then
      perform public.create_notification(
        v_shelter.profile_id,
        'DELIVERY_COMPLETED',
        'Food Delivered & Verified! 🎉',
        format('Your requested %s (%s %s) has arrived and delivery is complete.', coalesce(v_donation.food_name, 'surplus food'), coalesce(v_donation.quantity, 0), v_unit),
        'pickup',
        new.id,
        format('pickup_%s_delivered_shelter_%s', new.id, v_shelter.profile_id),
        jsonb_build_object('pickup_id', new.id, 'status', new.status, 'donation_id', new.donation_id)
      );
    end if;

    if v_driver_user_id is not null then
      perform public.create_notification(
        v_driver_user_id,
        'DELIVERY_COMPLETED',
        'Delivery Complete & Logged',
        format('Delivery at %s completed and proof recorded. Thank you for rescuing food!', coalesce(v_shelter.organization_name, 'the shelter')),
        'pickup',
        new.id,
        format('pickup_%s_delivered_driver_%s', new.id, v_driver_user_id),
        jsonb_build_object('pickup_id', new.id, 'status', new.status)
      );
    end if;

  elsif new.status = 'CANCELLED' then
    if v_driver_user_id is not null then
      perform public.create_notification(
        v_driver_user_id,
        'PICKUP_CANCELLED',
        'Pickup Cancelled',
        format('The pickup route for %s has been cancelled.', coalesce(v_donation.food_name, 'cargo')),
        'pickup',
        new.id,
        format('pickup_%s_cancelled_driver_%s', new.id, v_driver_user_id),
        jsonb_build_object('pickup_id', new.id, 'status', new.status)
      );
    end if;

    if v_donation.donor_id is not null then
      perform public.create_notification(
        v_donation.donor_id,
        'PICKUP_CANCELLED',
        'Pickup Cancelled',
        format('The scheduled pickup for your %s donation was cancelled.', coalesce(v_donation.food_name, 'food')),
        'pickup',
        new.id,
        format('pickup_%s_cancelled_donor_%s', new.id, v_donation.donor_id),
        jsonb_build_object('pickup_id', new.id, 'status', new.status)
      );
    end if;

    if v_shelter.profile_id is not null then
      perform public.create_notification(
        v_shelter.profile_id,
        'PICKUP_CANCELLED',
        'Delivery Cancelled',
        format('The incoming delivery for %s was cancelled.', coalesce(v_donation.food_name, 'food')),
        'pickup',
        new.id,
        format('pickup_%s_cancelled_shelter_%s', new.id, v_shelter.profile_id),
        jsonb_build_object('pickup_id', new.id, 'status', new.status)
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists pickup_status_notification_trigger on public.pickups;
create trigger pickup_status_notification_trigger
  after insert or update of status on public.pickups
  for each row execute function public.notify_pickup_status_change();

-- Phase 9: Match Notification Trigger
create or replace function public.notify_match_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_donation record;
  v_request record;
  v_shelter record;
begin
  select * into v_donation from public.donations where id = new.donation_id;
  select * into v_request from public.shelter_requests where id = new.shelter_request_id;
  if v_request.shelter_id is not null then
    select * into v_shelter from public.shelters where id = v_request.shelter_id;
  end if;

  if TG_OP = 'INSERT' then
    if v_donation.donor_id is not null then
      perform public.create_notification(
        v_donation.donor_id,
        'MATCH_FOUND',
        'Shelter Match Found! 🤝',
        format('Your donation "%s" (%s %s) matched with %s (score: %s%%).', v_donation.food_name, v_donation.quantity, coalesce(v_donation.unit, 'units'), coalesce(v_shelter.organization_name, 'a local shelter'), round(new.match_score)::text),
        'match',
        new.id,
        format('match_%s_donor_%s', new.id, v_donation.donor_id),
        jsonb_build_object('match_id', new.id, 'donation_id', new.donation_id, 'score', new.match_score)
      );
    end if;

    if v_shelter.profile_id is not null then
      perform public.create_notification(
        v_shelter.profile_id,
        'MATCH_FOUND',
        'Matching Surplus Available! 🤝',
        format('Surplus donation "%s" (%s %s) matches your request for "%s".', v_donation.food_name, v_donation.quantity, coalesce(v_donation.unit, 'units'), v_request.item_name),
        'match',
        new.id,
        format('match_%s_shelter_%s', new.id, v_shelter.profile_id),
        jsonb_build_object('match_id', new.id, 'shelter_request_id', new.shelter_request_id, 'score', new.match_score)
      );
    end if;

  elsif TG_OP = 'UPDATE' and old.status is distinct from new.status and new.status = 'accepted' then
    if v_donation.donor_id is not null then
      perform public.create_notification(
        v_donation.donor_id,
        'MATCH_ACCEPTED',
        'Match Accepted by Shelter',
        format('%s accepted your donation of "%s". A courier will be assigned soon!', coalesce(v_shelter.organization_name, 'The shelter'), v_donation.food_name),
        'match',
        new.id,
        format('match_%s_accepted_donor_%s', new.id, v_donation.donor_id),
        jsonb_build_object('match_id', new.id)
      );
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists match_notification_trigger on public.matches;
create trigger match_notification_trigger
  after insert or update of status on public.matches
  for each row execute function public.notify_match_event();

-- Phase 9: Urgent Shelter Request Trigger
create or replace function public.notify_urgent_shelter_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shelter record;
  v_admin record;
begin
  if new.urgency_level in ('high', 'critical') then
    select * into v_shelter from public.shelters where id = new.shelter_id;

    for v_admin in
      select id from public.profiles where role = 'admin'
    loop
      perform public.create_notification(
        v_admin.id,
        'URGENT_REQUEST',
        format('⚠️ Urgent Shelter Request: %s', upper(new.urgency_level)),
        format('%s urgently needs "%s" (%s %s). Match or dispatch priority needed.', coalesce(v_shelter.organization_name, 'Shelter'), new.item_name, new.quantity, coalesce(new.unit, 'units')),
        'shelter_request',
        new.id,
        format('urgent_req_%s_admin_%s', new.id, v_admin.id),
        jsonb_build_object('request_id', new.id, 'urgency', new.urgency_level)
      );
    end loop;
  end if;

  return new;
end;
$$;

drop trigger if exists shelter_request_urgent_trigger on public.shelter_requests;
create trigger shelter_request_urgent_trigger
  after insert on public.shelter_requests
  for each row execute function public.notify_urgent_shelter_request();

-- Phase 9: Urgent Expiry Check Function
create or replace function public.check_and_notify_expiring_donations(
  p_hours_threshold numeric default 4
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_donation record;
  v_admin record;
  v_count integer := 0;
  v_bucket text;
begin
  v_bucket := to_char(now(), 'YYYYMMDD_HH24');

  for v_donation in
    select d.id, d.food_name, d.quantity, d.unit, d.donor_id, d.expiry_time, d.pickup_address
    from public.donations d
    where d.status = 'posted'
      and d.expiry_time > now()
      and d.expiry_time <= now() + (p_hours_threshold || ' hours')::interval
  loop
    if v_donation.donor_id is not null then
      perform public.create_notification(
        v_donation.donor_id,
        'URGENT_EXPIRY',
        '⏳ Your Donation Expires Soon',
        format('Your surplus "%s" expires at %s. Ensure it is matched soon to avoid waste.', v_donation.food_name, to_char(v_donation.expiry_time, 'HH:MI AM, Mon DD')),
        'donation',
        v_donation.id,
        format('urgent_exp_%s_donor_%s', v_donation.id, v_bucket),
        jsonb_build_object('donation_id', v_donation.id, 'expiry_time', v_donation.expiry_time)
      );
      v_count := v_count + 1;
    end if;

    for v_admin in
      select id from public.profiles where role = 'admin'
    loop
      perform public.create_notification(
        v_admin.id,
        'URGENT_EXPIRY',
        '⏳ Rescue Priority: Unmatched Food Expiring',
        format('"%s" (%s %s) at %s expires in less than %s hours.', v_donation.food_name, v_donation.quantity, coalesce(v_donation.unit, 'units'), coalesce(v_donation.pickup_address, 'pickup point'), p_hours_threshold),
        'donation',
        v_donation.id,
        format('urgent_exp_%s_admin_%s_%s', v_donation.id, v_admin.id, v_bucket),
        jsonb_build_object('donation_id', v_donation.id, 'expiry_time', v_donation.expiry_time)
      );
      v_count := v_count + 1;
    end loop;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.check_and_notify_expiring_donations(numeric) from public;
grant execute on function public.check_and_notify_expiring_donations(numeric) to authenticated;

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

-- ============================================================
-- Phase 10: AI & Predictive Intelligence
-- ============================================================

alter table public.donations
  add column if not exists ai_estimated boolean not null default false,
  add column if not exists ai_metadata jsonb default null,
  add column if not exists expiry_risk text check (expiry_risk in ('low', 'medium', 'high', 'critical')) default null;

create index if not exists donations_expiry_risk_idx on public.donations (expiry_risk);

create or replace function public.get_donation_risk_assessment(p_donation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_donation record;
  v_hours_left numeric;
  v_compatible_requests_count integer;
  v_available_drivers_count integer;
  v_risk text;
  v_risk_reason text;
begin
  select * into v_donation from public.donations where id = p_donation_id;
  if not found then return null; end if;

  v_hours_left := extract(epoch from (v_donation.expiry_time - now())) / 3600.0;

  select count(*) into v_compatible_requests_count
  from public.shelter_requests sr
  where sr.status = 'open'
    and (sr.food_type = v_donation.food_type or sr.food_type = 'Other');

  select count(*) into v_available_drivers_count
  from public.drivers dr
  where coalesce(dr.is_available, dr.available) = true;

  if v_hours_left <= 0 then
    v_risk := 'critical';
    v_risk_reason := 'Food item has passed recorded expiry time.';
  elsif v_hours_left <= 4 and (v_compatible_requests_count = 0 or v_available_drivers_count = 0) then
    v_risk := 'critical';
    v_risk_reason := format('Expires in %s hours with %s compatible requests and %s available couriers.', round(v_hours_left, 1), v_compatible_requests_count, v_available_drivers_count);
  elsif v_hours_left <= 6 then
    v_risk := 'high';
    v_risk_reason := format('Short shelf-life (%s hours remaining). Prioritize dispatch.', round(v_hours_left, 1));
  elsif v_hours_left <= 24 and v_compatible_requests_count = 0 then
    v_risk := 'medium';
    v_risk_reason := 'Expires within 24 hours but no active shelter match found yet.';
  else
    v_risk := 'low';
    v_risk_reason := format('Comfortable shelf-life (%s hours remaining) with courier capacity available.', round(v_hours_left, 1));
  end if;

  update public.donations
  set expiry_risk = v_risk
  where id = p_donation_id;

  return jsonb_build_object(
    'donation_id', p_donation_id,
    'expiry_risk', v_risk,
    'risk_reason', v_risk_reason,
    'hours_left', round(v_hours_left, 1),
    'compatible_requests', v_compatible_requests_count,
    'available_drivers', v_available_drivers_count
  );
end;
$$;

revoke all on function public.get_donation_risk_assessment(uuid) from public;
grant execute on function public.get_donation_risk_assessment(uuid) to authenticated;

create or replace function public.get_demand_insights()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total_requests integer;
  v_total_fulfilled integer;
  v_categories jsonb;
  v_top_urgency jsonb;
begin
  select count(*) into v_total_requests from public.shelter_requests;
  select count(*) into v_total_fulfilled from public.pickups where status = 'DELIVERED';

  if v_total_requests < 3 then
    return jsonb_build_object(
      'has_sufficient_data', false,
      'total_requests', v_total_requests,
      'total_fulfilled', v_total_fulfilled
    );
  end if;

  select jsonb_agg(row_to_json(t)) into v_categories
  from (
    select
      food_type,
      count(*) as request_count,
      round((count(*)::numeric / v_total_requests::numeric) * 100, 1) as percentage
    from public.shelter_requests
    group by food_type
    order by count(*) desc
    limit 5
  ) t;

  select jsonb_agg(row_to_json(u)) into v_top_urgency
  from (
    select
      urgency_level,
      count(*) as count
    from public.shelter_requests
    group by urgency_level
    order by count(*) desc
  ) u;

  return jsonb_build_object(
    'has_sufficient_data', true,
    'total_requests', v_total_requests,
    'total_fulfilled', v_total_fulfilled,
    'top_categories', coalesce(v_categories, '[]'::jsonb),
    'urgency_breakdown', coalesce(v_top_urgency, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_demand_insights() from public;
grant execute on function public.get_demand_insights() to authenticated;