-- Phase 9: Robust Notifications & Communication System
-- Additive migration for notification event enhancements, idempotency deduplication,
-- automated role-aware triggers for food rescue lifecycle, user notification preferences,
-- and realtime publication.

-- 1. Ensure notification_events table exists with required fields
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

-- 2. Add additive columns for entity tracing and deduplication
alter table public.notification_events add column if not exists related_entity_type text;
alter table public.notification_events add column if not exists related_entity_id uuid;
alter table public.notification_events add column if not exists idempotency_key text;

-- 3. Strict deduplication index
create unique index if not exists notification_events_idempotency_idx
  on public.notification_events (user_id, idempotency_key)
  where idempotency_key is not null;

create index if not exists notification_events_user_read_created_idx
  on public.notification_events (user_id, read, created_at desc);

create index if not exists notification_events_entity_idx
  on public.notification_events (related_entity_type, related_entity_id);

-- 4. Secure RLS policies
alter table public.notification_events enable row level security;

drop policy if exists "Users can view their own notifications" on public.notification_events;
drop policy if exists "Users can update their own notifications" on public.notification_events;
drop policy if exists "Admins can view all notifications" on public.notification_events;

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

-- 5. User Notification Preferences table
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

drop policy if exists "Users manage own notification preferences" on public.notification_preferences;
create policy "Users manage own notification preferences"
  on public.notification_preferences for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- 6. Centralized secure notification insertion RPC (idempotent, server-side validated)
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

-- 7. Role-aware pickup notification trigger
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
  -- Only proceed if status actually changed or is a new insert
  if (TG_OP = 'UPDATE' and old.status is not distinct from new.status) then
    return new;
  end if;

  -- Load context
  select * into v_donation from public.donations where id = new.donation_id;
  select * into v_shelter from public.shelters where id = new.shelter_id;
  if new.driver_id is not null then
    select * into v_driver from public.drivers where id = new.driver_id;
    v_driver_user_id := coalesce(v_driver.user_id, v_driver.profile_id);
  end if;

  v_unit := coalesce(v_donation.unit, 'units');

  -- Handle ASSIGNED
  if new.status = 'ASSIGNED' then
    -- Notify Driver
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

    -- Notify Donor
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

    -- Notify Shelter
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

  -- Handle PICKUP
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

  -- Handle IN_TRANSIT
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

  -- Handle DELIVERED
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

  -- Handle CANCELLED
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

-- 8. Match Notification Trigger
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
    -- Notify Donor of match
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

    -- Notify Shelter of matching donation
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

-- 9. Urgent Shelter Request Trigger
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

    -- Notify all platform admins
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

-- 10. Urgent Expiry Check Function (callable on schedule or check)
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
  -- Bucket by hour to prevent repeating every minute
  v_bucket := to_char(now(), 'YYYYMMDD_HH24');

  for v_donation in
    select d.id, d.food_name, d.quantity, d.unit, d.donor_id, d.expiry_time, d.pickup_address
    from public.donations d
    where d.status = 'posted'
      and d.expiry_time > now()
      and d.expiry_time <= now() + (p_hours_threshold || ' hours')::interval
  loop
    -- Alert donor
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

    -- Alert admins for rescue dispatch priority
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

-- 11. Add notification_events to Realtime publication
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'notification_events'
    ) then
      execute 'alter publication supabase_realtime add table public.notification_events';
    end if;
  end if;
end;
$$;
