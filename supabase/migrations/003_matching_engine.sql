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

create index if not exists matches_donation_id_idx on public.matches (donation_id);
create index if not exists matches_shelter_request_id_idx on public.matches (shelter_request_id);
create index if not exists matches_status_score_idx on public.matches (status, match_score desc);

alter table public.matches enable row level security;

create or replace function public.haversine_distance_km(
  lat1 double precision,
  lon1 double precision,
  lat2 double precision,
  lon2 double precision
)
returns double precision
language sql
immutable
strict
as $$
  select 6371.0 * 2.0 * asin(least(1.0, sqrt(
    power(sin(radians(lat2 - lat1) / 2.0), 2)
    + cos(radians(lat1)) * cos(radians(lat2))
    * power(sin(radians(lon2 - lon1) / 2.0), 2)
  )));
$$;

create or replace function public.generate_matches_for_donation(p_donation_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  donation_row record;
  request_row record;
  category_score numeric;
  quantity_coverage_value numeric;
  quantity_score numeric;
  proximity_score numeric;
  expiry_score numeric;
  urgency_score numeric;
  score numeric;
  distance_value numeric;
  warning_value text;
begin
  select d.* into donation_row
  from public.donations d
  where d.id = p_donation_id
    and d.status = 'posted'
    and d.expiry_time > now();

  if not found then return; end if;

  for request_row in
    select
      sr.*,
      s.latitude as shelter_latitude,
      s.longitude as shelter_longitude,
      s.food_preferences
    from public.shelter_requests sr
    join public.shelters s on s.id = sr.shelter_id
    where sr.status = 'open'
      and sr.needed_by > now()
  loop
    category_score := case
      when lower(trim(coalesce(donation_row.food_type, ''))) = lower(trim(request_row.food_type)) then 40
      when lower(coalesce(request_row.food_preferences, '')) like '%' || lower(trim(request_row.food_type)) || '%' then 20
      else 0
    end;

    quantity_coverage_value := case
      when lower(trim(coalesce(donation_row.unit, ''))) = lower(trim(request_row.unit))
        then least(100, (donation_row.quantity / nullif(request_row.quantity, 0)) * 100)
      else 0
    end;
    quantity_score := quantity_coverage_value * 0.25;

    if donation_row.latitude is not null
      and donation_row.longitude is not null
      and request_row.shelter_latitude is not null
      and request_row.shelter_longitude is not null then
      distance_value := public.haversine_distance_km(
        donation_row.latitude,
        donation_row.longitude,
        request_row.shelter_latitude,
        request_row.shelter_longitude
      );
      proximity_score := greatest(0, 20 * (1 - least(distance_value, 50) / 50));
    else
      distance_value := null;
      proximity_score := 0;
    end if;

    if donation_row.expiry_time >= request_row.needed_by then
      expiry_score := 10;
      warning_value := 'safe';
    elsif donation_row.expiry_time > now() then
      expiry_score := 4;
      warning_value := 'expires-before-needed-by';
    else
      expiry_score := 0;
      warning_value := 'expired';
    end if;

    urgency_score := case request_row.urgency_level
      when 'critical' then 5
      when 'high' then 4
      when 'medium' then 2
      else 1
    end;

    score := round(category_score + quantity_score + proximity_score + expiry_score + urgency_score, 2);

    if score >= 35 and warning_value <> 'expired' then
      insert into public.matches (
        donation_id,
        shelter_request_id,
        match_score,
        distance_km,
        quantity_coverage,
        urgency_level,
        expiry_warning,
        status,
        updated_at
      ) values (
        donation_row.id,
        request_row.id,
        score,
        round(distance_value::numeric, 2),
        round(quantity_coverage_value, 2),
        request_row.urgency_level,
        warning_value,
        'proposed',
        now()
      )
      on conflict (donation_id, shelter_request_id) do update set
        match_score = excluded.match_score,
        distance_km = excluded.distance_km,
        quantity_coverage = excluded.quantity_coverage,
        urgency_level = excluded.urgency_level,
        expiry_warning = excluded.expiry_warning,
        updated_at = now()
      where public.matches.status = 'proposed';
    end if;
  end loop;
end;
$$;

create or replace function public.generate_matches_for_request(p_shelter_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  donation_id_value uuid;
begin
  for donation_id_value in
    select id from public.donations where status = 'posted' and expiry_time > now()
  loop
    perform public.generate_matches_for_donation(donation_id_value);
  end loop;
end;
$$;

create or replace function public.find_matches_for_donation(p_donation_id uuid)
returns setof public.matches
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (
    exists (select 1 from public.donations where id = p_donation_id and donor_id = auth.uid())
    or public.is_profile_role('admin')
  ) then
    raise exception 'Not authorized to calculate matches for this donation';
  end if;

  perform public.generate_matches_for_donation(p_donation_id);
  return query
    select * from public.matches
    where donation_id = p_donation_id
    order by match_score desc, distance_km nulls last;
end;
$$;

create or replace function public.find_matches_for_request(p_shelter_request_id uuid)
returns setof public.matches
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (
    exists (
      select 1
      from public.shelter_requests sr
      join public.shelters s on s.id = sr.shelter_id
      where sr.id = p_shelter_request_id and s.profile_id = auth.uid()
    )
    or public.is_profile_role('admin')
  ) then
    raise exception 'Not authorized to calculate matches for this request';
  end if;

  perform public.generate_matches_for_request(p_shelter_request_id);
  return query
    select * from public.matches
    where shelter_request_id = p_shelter_request_id
    order by match_score desc, distance_km nulls last;
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
begin
  if p_status not in ('accepted', 'dismissed') then
    raise exception 'Invalid match response';
  end if;

  if not (
    exists (
      select 1
      from public.matches m
      join public.donations d on d.id = m.donation_id
      where m.id = p_match_id and d.donor_id = auth.uid()
    )
    or exists (
      select 1
      from public.matches m
      join public.shelter_requests sr on sr.id = m.shelter_request_id
      join public.shelters s on s.id = sr.shelter_id
      where m.id = p_match_id and s.profile_id = auth.uid()
    )
    or public.is_profile_role('admin')
  ) then
    raise exception 'Not authorized to respond to this match';
  end if;

  update public.matches
  set status = p_status, updated_at = now()
  where id = p_match_id and status = 'proposed'
  returning * into match_row;

  if match_row.id is null then
    raise exception 'Match is no longer proposed';
  end if;

  if p_status = 'accepted' then
    update public.donations set status = 'matched' where id = match_row.donation_id and status = 'posted';
    update public.shelter_requests set status = 'matched' where id = match_row.shelter_request_id and status = 'open';
  end if;

  return match_row;
end;
$$;

create or replace function public.on_donation_matching_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.generate_matches_for_donation(new.id);
  return new;
end;
$$;

create or replace function public.on_shelter_request_matching_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.generate_matches_for_request(new.id);
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'on_donation_posted_generate_matches' and tgrelid = 'public.donations'::regclass) then
    create trigger on_donation_posted_generate_matches
      after insert or update of status on public.donations
      for each row when (new.status = 'posted')
      execute function public.on_donation_matching_trigger();
  end if;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'on_shelter_request_open_generate_matches' and tgrelid = 'public.shelter_requests'::regclass) then
    create trigger on_shelter_request_open_generate_matches
      after insert or update of status on public.shelter_requests
      for each row when (new.status = 'open')
      execute function public.on_shelter_request_matching_trigger();
  end if;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'matches' and policyname = 'Involved users can view matches') then
    create policy "Involved users can view matches"
      on public.matches for select to authenticated
      using (
        exists (select 1 from public.donations d where d.id = donation_id and d.donor_id = (select auth.uid()))
        or exists (
          select 1 from public.shelter_requests sr
          join public.shelters s on s.id = sr.shelter_id
          where sr.id = shelter_request_id and s.profile_id = (select auth.uid())
        )
        or public.is_profile_role('admin')
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'matches' and policyname = 'Involved users can create matches') then
    create policy "Involved users can create matches"
      on public.matches for insert to authenticated
      with check (public.is_profile_role('admin'));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'matches' and policyname = 'Involved users can update proposed matches') then
    create policy "Involved users can update proposed matches"
      on public.matches for update to authenticated
      using (
        status = 'proposed'
        and (
          exists (select 1 from public.donations d where d.id = donation_id and d.donor_id = (select auth.uid()))
          or exists (
            select 1 from public.shelter_requests sr
            join public.shelters s on s.id = sr.shelter_id
            where sr.id = shelter_request_id and s.profile_id = (select auth.uid())
          )
          or public.is_profile_role('admin')
        )
      )
      with check (
        status in ('accepted', 'dismissed')
        and (
          exists (select 1 from public.donations d where d.id = donation_id and d.donor_id = (select auth.uid()))
          or exists (
            select 1 from public.shelter_requests sr
            join public.shelters s on s.id = sr.shelter_id
            where sr.id = shelter_request_id and s.profile_id = (select auth.uid())
          )
          or public.is_profile_role('admin')
        )
      );
  end if;
end;
$$;

revoke all on function public.haversine_distance_km(double precision, double precision, double precision, double precision) from public;
revoke all on function public.generate_matches_for_donation(uuid) from public;
revoke all on function public.generate_matches_for_request(uuid) from public;
grant execute on function public.find_matches_for_donation(uuid) to authenticated;
grant execute on function public.find_matches_for_request(uuid) to authenticated;
grant execute on function public.respond_to_match(uuid, text) to authenticated;