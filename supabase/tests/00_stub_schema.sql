-- Minimal stand-in for the Supabase pieces the migration depends on,
-- so the migration can be exercised for real rather than eyeballed.

-- Roles are cluster-wide, so they survive a database drop.
do $$
begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;

create schema if not exists auth;

create table auth.users (
    id    uuid primary key default gen_random_uuid(),
    email text unique
);

-- auth.uid() reads the same GUC PostgREST sets.
create or replace function auth.uid() returns uuid
  language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

-- ── Base schema (from supabase/complete_rls_setup.sql + later add-column scripts) ──

create table companies (
    id          uuid primary key default gen_random_uuid(),
    name        text not null unique,
    brand_color text default '#3b82f6',
    city        text,
    state       text,
    phone       text,
    is_active   boolean default true,
    created_at  timestamptz default now()
);

create table profiles (
    id           uuid primary key,
    company_id   uuid references companies(id) on delete set null,
    name         text,
    username     text,
    role         text default 'CREW',
    notify_email text,
    created_at   timestamptz default now()
);

create table company_invites (
    id         uuid primary key default gen_random_uuid(),
    company_id uuid references companies(id) on delete cascade not null,
    token      uuid unique default gen_random_uuid() not null,
    used_at    timestamptz,
    created_at timestamptz default now()
);

alter table companies        enable row level security;
alter table profiles         enable row level security;
alter table company_invites  enable row level security;

-- The original vulnerable policies, so we can prove the migration removes them.
create policy "allow_own_profile" on profiles
  for all to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy "tenant_isolation_profiles" on profiles
  for all to authenticated
  using (company_id = (select company_id from profiles where id = auth.uid()));

create policy "super_admin_read_all_profiles" on profiles
  for select to authenticated using (true);

create policy "mark_invite_used" on company_invites
  for update to authenticated
  using (used_at is null) with check (true);

create policy "tenant_isolation_companies" on companies
  for select to authenticated using (true);

create policy "allow_company_insert" on companies
  for insert to authenticated with check (true);

-- Pre-existing SECURITY DEFINER helpers, deliberately without search_path,
-- so CREATE OR REPLACE in the migration is exercised against real originals.
create or replace function is_super_admin() returns boolean
  language sql security definer stable as $$
    select exists (select 1 from public.profiles where id = auth.uid() and role = 'SUPER_ADMIN');
$$;

create or replace function get_user_company_id() returns uuid
  language sql security definer stable as $$
    select company_id from public.profiles where id = auth.uid();
$$;

create or replace function validate_invite_token(p_token uuid)
  returns table(company_id uuid, company_name text)
  language sql security definer stable as $$
    select ci.company_id, c.name from public.company_invites ci
    join public.companies c on c.id = ci.company_id
    where ci.token = p_token and ci.used_at is null;
$$;

create or replace function get_company_by_name(p_name text)
  returns table(company_id uuid, company_name text, brand_color text)
  language sql security definer stable as $$
    select id, name, brand_color from public.companies where lower(name) = lower(p_name) limit 1;
$$;

create or replace function get_alert_emails(p_company_id uuid)
  returns table(notify_email text)
  language plpgsql security definer as $$
begin
  if not (get_user_company_id() = p_company_id or is_super_admin()) then
    raise exception 'Unauthorized';
  end if;
  return query select p.notify_email from public.profiles p
    where p.company_id = p_company_id and p.role in ('ADMIN','SUPER_ADMIN')
      and p.notify_email is not null and p.notify_email <> '';
end;
$$;

grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to authenticated;
grant execute on all functions in schema public to anon, authenticated;
grant usage on schema auth to anon, authenticated;
grant select on auth.users to authenticated;
