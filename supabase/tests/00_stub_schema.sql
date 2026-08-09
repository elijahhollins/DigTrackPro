-- Stand-in for the Supabase pieces the migration depends on, so it can be
-- exercised for real rather than eyeballed.
--
-- This mirrors PRODUCTION as observed on 2026-08-09, not the repo's
-- supabase/complete_rls_setup.sql — the two have drifted badly. Differences
-- that matter: profiles has no created_at but does have a `password`
-- column; there is no tenant_isolation_profiles policy; and the real policy
-- set is the seven below. handle_new_user() on auth.users is reproduced
-- because the migration's guard trigger has to coexist with it.

-- Roles are cluster-wide, so they survive a database drop.
do $$
begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;

create schema if not exists auth;

create table auth.users (
    id                 uuid primary key default gen_random_uuid(),
    email              text unique,
    raw_user_meta_data jsonb default '{}'::jsonb
);

-- auth.uid() reads the same GUC PostgREST sets.
create or replace function auth.uid() returns uuid
  language sql stable as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

-- ── Tables, matching production column-for-column ────────────────────────

create table companies (
    id                    uuid primary key default gen_random_uuid(),
    name                  text not null unique,
    brand_color           text default '#3b82f6',
    city                  text,
    state                 text,
    phone                 text,
    is_active             boolean default true,
    inbound_enabled       boolean default false,
    scheduling_enabled    boolean default false,
    time_tracking_enabled boolean default false,
    inventory_enabled     boolean default false,
    created_at            timestamptz default now()
);

-- NB: no created_at, and a legacy `password` column.
create table profiles (
    id           uuid primary key,
    company_id   uuid references companies(id) on delete set null,
    name         text,
    username     text,
    role         text default 'CREW',
    notify_email text,
    password     text
);

create table company_invites (
    id         uuid primary key default gen_random_uuid(),
    company_id uuid references companies(id) on delete cascade not null,
    token      uuid unique default gen_random_uuid() not null,
    used_at    timestamptz,
    created_at timestamptz default now()
);

alter table companies       enable row level security;
alter table profiles        enable row level security;
alter table company_invites enable row level security;

-- ── Pre-existing SECURITY DEFINER helpers ────────────────────────────────
-- Deliberately declared WITHOUT search_path, so section 7 of the migration
-- is exercised against real unhardened originals.

create or replace function is_super_admin() returns boolean
  language sql security definer stable as $$
    select exists (select 1 from public.profiles where id = auth.uid() and role = 'SUPER_ADMIN');
$$;

create or replace function get_user_company_id() returns uuid
  language sql security definer stable as $$
    select company_id from public.profiles where id = auth.uid();
$$;

create or replace function is_company_admin() returns boolean
  language sql security definer stable as $$
    select exists (select 1 from public.profiles
                   where id = auth.uid() and role in ('ADMIN','SUPER_ADMIN'));
$$;

create or replace function is_admin_of_company(p_company_id uuid) returns boolean
  language sql security definer stable as $$
    select exists (select 1 from public.profiles
                   where id = auth.uid() and company_id = p_company_id
                     and role in ('ADMIN','SUPER_ADMIN'));
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

-- Production creates the profile row from a trigger on auth.users. The
-- migration's guard trigger must coexist with this: it forces role='CREW'
-- and company_id=null on INSERT, which is exactly what this already does.
create or replace function handle_new_user() returns trigger
  language plpgsql security definer as $$
begin
  insert into public.profiles (id, name, username, role)
  values (new.id, new.raw_user_meta_data->>'name', new.email, 'CREW');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ── Production's actual policies, including the vulnerable one ───────────
-- The migration must remove these, so the test proves removal rather than
-- layering on top.

create policy "allow_own_profile" on profiles
  for all to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy "allow_own_password_management" on profiles
  for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy "allow_own_profile_name_update" on profiles
  for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy "view_company_profiles" on profiles
  for select to authenticated
  using (company_id = get_user_company_id());

create policy "admin_manage_company_roles" on profiles
  for update to authenticated
  using (company_id = get_user_company_id() and is_company_admin() and id <> auth.uid())
  with check (company_id = get_user_company_id() and is_company_admin());

create policy "allow_admin_update_user_name" on profiles
  for update to authenticated
  using (company_id = get_user_company_id()
         and (select role from profiles p2 where p2.id = auth.uid()) = 'ADMIN')
  with check (company_id = get_user_company_id()
         and (select role from profiles p2 where p2.id = auth.uid()) = 'ADMIN');

create policy "super_admin_manage_all_profiles" on profiles
  for all to authenticated
  using (is_super_admin()) with check (is_super_admin());

create policy "mark_invite_used" on company_invites
  for update to authenticated
  using (used_at is null) with check (true);

create policy "super_admin_manage_invites" on company_invites
  for all to authenticated
  using (is_super_admin()) with check (is_super_admin());

create policy "tenant_isolation_companies" on companies
  for select to authenticated using (true);

create policy "allow_company_insert" on companies
  for insert to authenticated with check (true);

grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to authenticated;
grant execute on all functions in schema public to anon, authenticated;
grant usage on schema auth to anon, authenticated;
grant select on auth.users to authenticated;
