-- Phase 10: AI & Predictive Intelligence
-- Additive migration for AI photo intake metadata, deterministic expiry-risk calculation,
-- and real historical demand analytics.

-- 1. Additive columns on public.donations
alter table public.donations
  add column if not exists ai_estimated boolean not null default false,
  add column if not exists ai_metadata jsonb default null,
  add column if not exists expiry_risk text check (expiry_risk in ('low', 'medium', 'high', 'critical')) default null;

-- Index for querying high-risk expiring donations
create index if not exists donations_expiry_risk_idx on public.donations (expiry_risk);

-- 2. Deterministic Expiry-Risk Assessment Function
-- Evaluates real DB factors: remaining hours, count of compatible shelter requests, available couriers
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

  -- Calculate exact remaining hours
  v_hours_left := extract(epoch from (v_donation.expiry_time - now())) / 3600.0;

  -- Count compatible open shelter requests
  select count(*) into v_compatible_requests_count
  from public.shelter_requests sr
  where sr.status = 'open'
    and (sr.food_type = v_donation.food_type or sr.food_type = 'Other');

  -- Count available drivers
  select count(*) into v_available_drivers_count
  from public.drivers dr
  where coalesce(dr.is_available, dr.available) = true;

  -- Deterministic formula (no hallucinations)
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

  -- Optionally update the donation record's risk column for quick indexing
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

-- 3. Demand Insights Function (strictly derived from real DB history)
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

  -- If insufficient real history, report honestly rather than inventing statistics
  if v_total_requests < 3 then
    return jsonb_build_object(
      'has_sufficient_data', false,
      'total_requests', v_total_requests,
      'total_fulfilled', v_total_fulfilled
    );
  end if;

  -- Calculate category distribution
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

  -- Calculate urgency breakdown
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
