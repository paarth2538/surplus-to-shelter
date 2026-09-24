-- Phase 8: Impact Dashboard & Verification
-- Adds strict deduplication on impact records, automated verified impact creation on delivery,
-- driver and public impact visibility, and aggregate public metrics.

-- 1. Deduplicate any existing impact records and add unique constraint on donation_id
delete from public.impact
where id not in (
  select distinct on (donation_id) id
  from public.impact
  order by donation_id, created_at desc
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'impact_donation_id_key'
  ) then
    alter table public.impact add constraint impact_donation_id_key unique (donation_id);
  end if;
end;
$$;

create index if not exists impact_created_at_idx on public.impact (created_at desc);

-- 2. Expand RLS policy on public.impact to allow relevant donors, shelters, drivers, and admins
drop policy if exists "Relevant users can view impact" on public.impact;
drop policy if exists "Public can view verified impact" on public.impact;

create policy "Relevant users can view impact"
  on public.impact for select to authenticated
  using (
    public.owns_donation(donation_id)
    or public.is_profile_role('shelter')
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

create policy "Public can view verified impact"
  on public.impact for select to anon
  using (true);

-- 3. Automatic impact recording on delivery verification trigger
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

      -- Calculate standardized weight in kg
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

      -- Calculate meals rescued
      if v_unit in ('meal', 'meals', 'serving', 'servings', 'portion', 'portions') then
        v_meals := v_donation.quantity;
      elsif v_weight is not null and v_weight > 0 then
        -- 0.42 kg per standard food rescue meal
        v_meals := round((v_weight / 0.42)::numeric, 1);
      else
        v_meals := null;
      end if;

      -- Calculate CO2e avoided (2.5 kg CO2e per 1 kg food waste diverted from landfill)
      if v_weight is not null and v_weight > 0 then
        v_co2e := round((v_weight * 2.5)::numeric, 2);
      else
        v_co2e := null;
      end if;

      -- Ensure impact record is recorded idempotently
      insert into public.impact (
        donation_id,
        weight_rescued,
        meals_rescued,
        co2e_avoided,
        created_at
      )
      values (
        NEW.donation_id,
        v_weight,
        v_meals,
        v_co2e,
        coalesce(NEW.delivered_at, now())
      )
      on conflict (donation_id) do nothing;

      -- Keep donation status in sync with delivered pickup
      if v_donation.status <> 'delivered' then
        update public.donations
        set status = 'delivered'
        where id = v_donation.id;
      end if;
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

-- 4. Backfill any existing DELIVERED pickups that lack impact records
insert into public.impact (donation_id, weight_rescued, meals_rescued, co2e_avoided, created_at)
select
  p.donation_id,
  case
    when lower(trim(d.unit)) in ('kg', 'kgs', 'kilogram', 'kilograms') then d.quantity
    when lower(trim(d.unit)) in ('g', 'gm', 'gram', 'grams') then round((d.quantity / 1000.0)::numeric, 3)
    when lower(trim(d.unit)) in ('lb', 'lbs', 'pound', 'pounds') then round((d.quantity * 0.45359237)::numeric, 2)
    when lower(trim(d.unit)) in ('oz', 'ounce', 'ounces') then round((d.quantity * 0.0283495)::numeric, 3)
    else null
  end as weight_rescued,
  case
    when lower(trim(d.unit)) in ('meal', 'meals', 'serving', 'servings', 'portion', 'portions') then d.quantity
    when lower(trim(d.unit)) in ('kg', 'kgs', 'kilogram', 'kilograms') then round((d.quantity / 0.42)::numeric, 1)
    when lower(trim(d.unit)) in ('lb', 'lbs', 'pound', 'pounds') then round(((d.quantity * 0.45359237) / 0.42)::numeric, 1)
    else null
  end as meals_rescued,
  case
    when lower(trim(d.unit)) in ('kg', 'kgs', 'kilogram', 'kilograms') then round((d.quantity * 2.5)::numeric, 2)
    when lower(trim(d.unit)) in ('lb', 'lbs', 'pound', 'pounds') then round((d.quantity * 0.45359237 * 2.5)::numeric, 2)
    else null
  end as co2e_avoided,
  coalesce(p.delivered_at, p.updated_at, now()) as created_at
from public.pickups p
join public.donations d on d.id = p.donation_id
where p.status = 'DELIVERED'
on conflict (donation_id) do nothing;

-- 5. Public aggregate metrics function (no PII, aggregates only from verified deliveries)
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

-- 6. Add impact to Supabase Realtime publication if available
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'impact'
    ) then
      execute 'alter publication supabase_realtime add table public.impact';
    end if;
  end if;
end;
$$;
