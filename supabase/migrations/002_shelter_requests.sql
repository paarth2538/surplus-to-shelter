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

create index if not exists shelter_requests_shelter_id_idx on public.shelter_requests (shelter_id);
create index if not exists shelter_requests_status_idx on public.shelter_requests (status);
create index if not exists shelter_requests_urgency_level_idx on public.shelter_requests (urgency_level);
create index if not exists shelter_requests_needed_by_idx on public.shelter_requests (needed_by);

alter table public.shelter_requests enable row level security;

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

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'shelter_requests' and policyname = 'Shelters can view their own requests') then
    create policy "Shelters can view their own requests"
      on public.shelter_requests for select to authenticated
      using (exists (select 1 from public.shelters s where s.id = shelter_id and s.profile_id = (select auth.uid())));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'shelter_requests' and policyname = 'Shelters can create their own requests') then
    create policy "Shelters can create their own requests"
      on public.shelter_requests for insert to authenticated
      with check (
        public.is_profile_role('shelter')
        and exists (select 1 from public.shelters s where s.id = shelter_id and s.profile_id = (select auth.uid()))
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'shelter_requests' and policyname = 'Shelters can update their open requests') then
    create policy "Shelters can update their open requests"
      on public.shelter_requests for update to authenticated
      using (
        status = 'open'
        and exists (select 1 from public.shelters s where s.id = shelter_id and s.profile_id = (select auth.uid()))
      )
      with check (
        status in ('open', 'cancelled')
        and exists (select 1 from public.shelters s where s.id = shelter_id and s.profile_id = (select auth.uid()))
      );
  end if;
end;
$$;