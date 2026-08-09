-- ================================================================
-- Lock down profiles.role — privilege escalation fix
-- ================================================================
-- PROBLEM
-- -------
-- profiles carried two FOR ALL policies:
--
--   allow_own_profile          USING/WITH CHECK (id = auth.uid())
--   tenant_isolation_profiles  USING (company_id = get_user_company_id())
--
-- FOR ALL includes UPDATE, profiles.role was an unconstrained text
-- column, and nothing guarded it. So any authenticated user could run
--
--   supabase.from('profiles').update({ role: 'SUPER_ADMIN' })
--                            .eq('id', <their own uid>)
--
-- from the browser console and gain cross-tenant access to every
-- company. tenant_isolation_profiles had no WITH CHECK, so Postgres
-- reused its USING clause as the check and the same trick worked
-- against any teammate's row.
--
-- FIX
-- ---
-- 1. Constrain role to the three known values.
-- 2. A BEFORE INSERT/UPDATE trigger rejects any direct write to role
--    or company_id. RLS alone cannot do this — a WITH CHECK expression
--    cannot reference the OLD row, so no policy can say "role must be
--    unchanged".
-- 3. Replace the FOR ALL policies with per-command policies.
-- 4. Route every legitimate role/membership change through SECURITY
--    DEFINER functions that check the caller's authority first.
--
-- SUPER_ADMIN is deliberately not grantable by any of these functions.
-- It can only be set by hand in the SQL editor:
--
--   select set_super_admin('user@example.com');
--
-- Requires the base schema (supabase/complete_rls_setup.sql).
-- ================================================================

begin;

-- ────────────────────────────────────────────────────────────────
-- 1. Constrain the role column
-- ────────────────────────────────────────────────────────────────

-- Anything outside the known set is either legacy junk or evidence of
-- tampering; park it at the lowest privilege rather than failing the
-- migration. Review supabase/SECURITY_ROLE_LOCKDOWN.md before running
-- this on a database you have not audited.
update profiles
   set role = 'CREW'
 where role is null
    or role not in ('CREW', 'ADMIN', 'SUPER_ADMIN');

alter table profiles alter column role set default 'CREW';
alter table profiles alter column role set not null;

alter table profiles drop constraint if exists profiles_role_valid;
alter table profiles
  add constraint profiles_role_valid
  check (role in ('CREW', 'ADMIN', 'SUPER_ADMIN'));


-- ────────────────────────────────────────────────────────────────
-- 2. Preconditions
-- ────────────────────────────────────────────────────────────────
-- The policies below are built on helper predicates that already exist in
-- this database. They are deliberately NOT redefined here: the core schema
-- lives in hand-applied scripts under supabase/*.sql that have drifted
-- badly from what production actually runs, so overwriting a live function
-- body with repo text would be a guess. Fail loudly instead if one is
-- missing. (Their search_path is hardened in section 7, which changes the
-- setting without touching the body.)

do $$
declare
  missing text[] := '{}';
  required text[] := array[
    'public.is_super_admin()',
    'public.get_user_company_id()',
    'public.is_admin_of_company(uuid)'
  ];
  fn text;
begin
  foreach fn in array required loop
    if to_regprocedure(fn) is null then
      missing := missing || fn;
    end if;
  end loop;

  if array_length(missing, 1) > 0 then
    raise exception
      'Missing helper function(s): %. Apply the base schema before this migration.',
      array_to_string(missing, ', ');
  end if;
end;
$$;


-- ────────────────────────────────────────────────────────────────
-- 3. The guard trigger
-- ────────────────────────────────────────────────────────────────
-- Authorized paths announce themselves by setting a transaction-local
-- GUC immediately before writing. A PostgREST client cannot set it:
-- PostgREST only forwards request.* settings, and set_config is not an
-- exposed RPC. So the flag is reachable only from inside the SECURITY
-- DEFINER functions below.
--
-- Note there is no is_super_admin() escape hatch here on purpose. A
-- super admin someone has escalated into is precisely the attacker this
-- is meant to stop.

create or replace function public.guard_profile_privileged_columns()
  returns trigger
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
begin
  if coalesce(current_setting('app.privileged_profile_write', true), 'off') = 'on' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Clients never choose their own role, and membership is granted by
    -- claim_invite() / join_company_by_name() / create_company_and_claim_admin(),
    -- never claimed at insert time.
    new.role := 'CREW';
    new.company_id := null;
  else
    if new.role is distinct from old.role then
      raise exception 'profiles.role cannot be changed directly; use set_user_role()'
        using errcode = '42501';
    end if;
    if new.company_id is distinct from old.company_id then
      raise exception 'profiles.company_id cannot be changed directly; use claim_invite() or admin_set_user_company()'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_privileged_columns on profiles;
create trigger profiles_guard_privileged_columns
  before insert or update on profiles
  for each row execute function public.guard_profile_privileged_columns();


-- ────────────────────────────────────────────────────────────────
-- 4. Replace the profiles policies
-- ────────────────────────────────────────────────────────────────
-- Drop by discovery rather than by name. The repo's SQL has drifted
-- from production, so an enumerated DROP list risks leaving a stale
-- permissive policy behind — and one surviving FOR ALL policy reopens
-- the whole hole.

do $$
declare
  pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'profiles'
  loop
    execute format('drop policy if exists %I on public.profiles', pol.policyname);
  end loop;
end;
$$;

alter table profiles enable row level security;

-- SELECT: your own row, your teammates, or everything if super admin.
create policy "profiles_select_own" on profiles
  for select to authenticated
  using (id = auth.uid());

create policy "profiles_select_teammates" on profiles
  for select to authenticated
  using (company_id is not null and company_id = get_user_company_id());

create policy "profiles_select_super_admin" on profiles
  for select to authenticated
  using (is_super_admin());

-- INSERT / UPDATE: your own row only. role and company_id are pinned by
-- the trigger regardless of what the client sends.
create policy "profiles_insert_own" on profiles
  for insert to authenticated
  with check (id = auth.uid());

create policy "profiles_update_own" on profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Admins edit their teammates' display name and alert email (Team
-- Management). This is safe to grant broadly because the guard trigger
-- rejects role and company_id writes no matter who is making them — the
-- policy controls *which rows*, the trigger controls *which columns*.
create policy "profiles_update_admin_teammates" on profiles
  for update to authenticated
  using (is_admin_of_company(company_id) or is_super_admin())
  with check (is_admin_of_company(company_id) or is_super_admin());

-- DELETE: admins only, and never yourself. Previously the FOR ALL grant
-- meant any crew member could delete a teammate's profile.
create policy "profiles_delete_admin" on profiles
  for delete to authenticated
  using (
    id <> auth.uid()
    and (is_admin_of_company(company_id) or is_super_admin())
  );


-- ────────────────────────────────────────────────────────────────
-- 5. Invite consumption
-- ────────────────────────────────────────────────────────────────
-- mark_invite_used was USING (used_at IS NULL) WITH CHECK (true), which
-- let any authenticated user burn any outstanding invite for any
-- company. claim_invite() replaces it and consumes the token in the
-- same transaction that grants membership.

drop policy if exists "mark_invite_used" on company_invites;


-- ────────────────────────────────────────────────────────────────
-- 6. Authorized mutation paths
-- ────────────────────────────────────────────────────────────────

-- Change a teammate's role. Never grants or revokes SUPER_ADMIN.
create or replace function public.set_user_role(p_user_id uuid, p_role text)
  returns void
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_caller_role    text;
  v_caller_company uuid;
  v_target_role    text;
  v_target_company uuid;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_role not in ('CREW', 'ADMIN') then
    raise exception 'Role % cannot be granted through the application', p_role
      using errcode = '42501';
  end if;

  if p_user_id = auth.uid() then
    raise exception 'You cannot change your own role' using errcode = '42501';
  end if;

  select role, company_id into v_caller_role, v_caller_company
  from profiles where id = auth.uid();

  if v_caller_role is null or v_caller_role not in ('ADMIN', 'SUPER_ADMIN') then
    raise exception 'Only admins can change roles' using errcode = '42501';
  end if;

  select role, company_id into v_target_role, v_target_company
  from profiles where id = p_user_id;

  if v_target_role is null then
    raise exception 'User not found' using errcode = 'P0002';
  end if;

  if v_target_role = 'SUPER_ADMIN' then
    raise exception 'Super admin roles cannot be changed through the application'
      using errcode = '42501';
  end if;

  -- A company admin is confined to their own company; a super admin is not.
  if v_caller_role = 'ADMIN'
     and (v_caller_company is null or v_target_company is distinct from v_caller_company) then
    raise exception 'You can only change roles for members of your own company'
      using errcode = '42501';
  end if;

  perform set_config('app.privileged_profile_write', 'on', true);
  update profiles set role = p_role where id = p_user_id;
  perform set_config('app.privileged_profile_write', 'off', true);
end;
$$;


-- Move a user between companies. Super admin only.
create or replace function public.admin_set_user_company(p_user_id uuid, p_company_id uuid)
  returns void
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
begin
  if not is_super_admin() then
    raise exception 'Only super admins can reassign a user to another company'
      using errcode = '42501';
  end if;

  if not exists (select 1 from companies where id = p_company_id) then
    raise exception 'Company not found' using errcode = 'P0002';
  end if;

  if not exists (select 1 from profiles where id = p_user_id) then
    raise exception 'User not found' using errcode = 'P0002';
  end if;

  if exists (select 1 from profiles where id = p_user_id and role = 'SUPER_ADMIN') then
    raise exception 'Super admin accounts cannot be reassigned through the application'
      using errcode = '42501';
  end if;

  perform set_config('app.privileged_profile_write', 'on', true);
  update profiles set company_id = p_company_id where id = p_user_id;
  perform set_config('app.privileged_profile_write', 'off', true);
end;
$$;


-- Bootstrap: a user with no company creates one and becomes its ADMIN.
-- Replaces the client-side self-promotion this used to do.
create or replace function public.create_company_and_claim_admin(
  p_company_name text,
  p_brand_color  text default null,
  p_city         text default null,
  p_state        text default null,
  p_phone        text default null,
  p_user_name    text default null,
  p_username     text default null
)
  returns uuid
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_uid        uuid := auth.uid();
  v_existing   uuid;
  v_company_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if p_company_name is null or btrim(p_company_name) = '' then
    raise exception 'Company name is required' using errcode = '22023';
  end if;

  select company_id into v_existing from profiles where id = v_uid;
  if v_existing is not null then
    raise exception 'You already belong to a company' using errcode = '42501';
  end if;

  insert into companies (id, name, brand_color, city, state, phone)
  values (gen_random_uuid(), btrim(p_company_name), coalesce(p_brand_color, '#3b82f6'),
          p_city, p_state, p_phone)
  returning id into v_company_id;

  perform set_config('app.privileged_profile_write', 'on', true);
  insert into profiles (id, name, username, role, company_id)
  values (v_uid, coalesce(nullif(btrim(p_user_name), ''), 'New User'),
          coalesce(p_username, ''), 'ADMIN', v_company_id)
  on conflict (id) do update
    set role       = 'ADMIN',
        company_id = v_company_id,
        name       = coalesce(nullif(btrim(excluded.name), ''), profiles.name),
        username   = coalesce(nullif(btrim(excluded.username), ''), profiles.username);
  perform set_config('app.privileged_profile_write', 'off', true);

  return v_company_id;
end;
$$;


-- Join a company by invite token. Validates and consumes the token in
-- one transaction, so a token cannot be replayed.
create or replace function public.claim_invite(
  p_token     uuid,
  p_user_name text default null,
  p_username  text default null
)
  returns uuid
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_uid        uuid := auth.uid();
  v_existing   uuid;
  v_company_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select company_id into v_existing from profiles where id = v_uid;
  if v_existing is not null then
    raise exception 'You already belong to a company' using errcode = '42501';
  end if;

  update company_invites
     set used_at = now()
   where token = p_token
     and used_at is null
  returning company_id into v_company_id;

  if v_company_id is null then
    raise exception 'Invite link is invalid or has already been used'
      using errcode = '42501';
  end if;

  perform set_config('app.privileged_profile_write', 'on', true);
  -- On the update path role is deliberately left alone. The old client
  -- code rewrote it to CREW here, silently demoting anyone whose
  -- profile happened to be missing a company_id.
  insert into profiles (id, name, username, role, company_id)
  values (v_uid, coalesce(nullif(btrim(p_user_name), ''), 'New User'),
          coalesce(p_username, ''), 'CREW', v_company_id)
  on conflict (id) do update
    set company_id = v_company_id,
        name       = coalesce(nullif(btrim(excluded.name), ''), profiles.name),
        username   = coalesce(nullif(btrim(excluded.username), ''), profiles.username);
  perform set_config('app.privileged_profile_write', 'off', true);

  return v_company_id;
end;
$$;


-- Join a company by name. Preserves the existing crew-signup flow.
--
-- NOTE: this is a weak boundary — anyone who knows a company's name can
-- join it. That predates this migration and is left as-is so the fix
-- stays scoped. The durable answer is to retire name-based joining and
-- require invite tokens. See supabase/SECURITY_ROLE_LOCKDOWN.md.
create or replace function public.join_company_by_name(
  p_company_name text,
  p_user_name    text default null,
  p_username     text default null
)
  returns uuid
  language plpgsql
  security definer
  set search_path = public, pg_temp
as $$
declare
  v_uid        uuid := auth.uid();
  v_existing   uuid;
  v_company_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select company_id into v_existing from profiles where id = v_uid;
  if v_existing is not null then
    raise exception 'You already belong to a company' using errcode = '42501';
  end if;

  select id into v_company_id
  from companies
  where lower(name) = lower(btrim(p_company_name))
  limit 1;

  if v_company_id is null then
    raise exception 'Company not found' using errcode = 'P0002';
  end if;

  perform set_config('app.privileged_profile_write', 'on', true);
  insert into profiles (id, name, username, role, company_id)
  values (v_uid, coalesce(nullif(btrim(p_user_name), ''), 'New User'),
          coalesce(p_username, ''), 'CREW', v_company_id)
  on conflict (id) do update
    set company_id = v_company_id,
        name       = coalesce(nullif(btrim(excluded.name), ''), profiles.name),
        username   = coalesce(nullif(btrim(excluded.username), ''), profiles.username);
  perform set_config('app.privileged_profile_write', 'off', true);

  return v_company_id;
end;
$$;


-- Out-of-band super admin promotion. Not callable from the app — the
-- grants below withhold it from anon and authenticated, so it only runs
-- for a superuser in the SQL editor.
create or replace function public.set_super_admin(p_email text)
  returns void
  language plpgsql
  security definer
  set search_path = public, pg_temp, auth
as $$
declare
  v_uid     uuid;
  v_updated int;
begin
  select id into v_uid from auth.users where lower(email) = lower(btrim(p_email));
  if v_uid is null then
    raise exception 'No auth user with email %', p_email using errcode = 'P0002';
  end if;

  perform set_config('app.privileged_profile_write', 'on', true);
  update profiles set role = 'SUPER_ADMIN' where id = v_uid;
  get diagnostics v_updated = row_count;
  perform set_config('app.privileged_profile_write', 'off', true);

  if v_updated = 0 then
    raise exception 'No profile row for %; the user must sign in once first', p_email
      using errcode = 'P0002';
  end if;
end;
$$;


-- ────────────────────────────────────────────────────────────────
-- 7. Harden every SECURITY DEFINER function
-- ────────────────────────────────────────────────────────────────
-- A SECURITY DEFINER function with a mutable search_path can be steered
-- into resolving an unqualified name against a schema the caller controls,
-- and it runs with the owner's privileges when it gets there. Supabase
-- lints this as function_search_path_mutable.
--
-- This pins the setting WITHOUT touching any function body. That matters:
-- production carries SECURITY DEFINER functions that exist nowhere in this
-- repo (handle_new_user, broadcast_ticket_alert, handle_notification_event),
-- so rewriting bodies from repo text would be guesswork. ALTER FUNCTION
-- changes only the setting, and the loop picks up functions added later
-- that this file has never seen.
--
-- public, pg_temp is safe for all of them: every one references its tables
-- schema-qualified (public.profiles, public.push_subscriptions) and reaches
-- pg_net as net.http_post, which resolves independently of this setting.

do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure::text as signature
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prosecdef
      and not exists (
        select 1 from unnest(coalesce(p.proconfig, '{}')) cfg
        where cfg like 'search\_path=%'
      )
  loop
    execute format('alter function %s set search_path = public, pg_temp', fn.signature);
    raise notice 'pinned search_path on %', fn.signature;
  end loop;
end;
$$;


-- ────────────────────────────────────────────────────────────────
-- 8. Grants
-- ────────────────────────────────────────────────────────────────
-- Default-deny, then hand back only what each caller class needs.
-- GRANT ALL ON ALL TABLES ... TO authenticated in the base schema means
-- table privileges are wide open; RLS plus the trigger is what actually
-- constrains writes.

revoke execute on function public.set_user_role(uuid, text)                             from public, anon;
revoke execute on function public.admin_set_user_company(uuid, uuid)                    from public, anon;
revoke execute on function public.create_company_and_claim_admin(text, text, text, text, text, text, text) from public, anon;
revoke execute on function public.claim_invite(uuid, text, text)                        from public, anon;
revoke execute on function public.join_company_by_name(text, text, text)                from public, anon;
revoke execute on function public.guard_profile_privileged_columns()                    from public, anon, authenticated;
revoke execute on function public.set_super_admin(text)                                 from public, anon, authenticated;

grant execute on function public.set_user_role(uuid, text)                              to authenticated;
grant execute on function public.admin_set_user_company(uuid, uuid)                     to authenticated;
grant execute on function public.create_company_and_claim_admin(text, text, text, text, text, text, text) to authenticated;
grant execute on function public.claim_invite(uuid, text, text)                         to authenticated;
grant execute on function public.join_company_by_name(text, text, text)                 to authenticated;

-- get_company_by_name was granted to anon, making it an unauthenticated
-- oracle for whether a given company name exists. The only caller runs
-- inside an authenticated session (App.tsx, within initApp).
--
-- The revoke must name PUBLIC as well as anon. Postgres grants EXECUTE on
-- every new function to PUBLIC by default, and CREATE OR REPLACE keeps
-- that grant — so revoking from anon alone leaves anon still able to call
-- it through PUBLIC.
revoke execute on function public.get_company_by_name(text) from public, anon;
grant  execute on function public.get_company_by_name(text) to authenticated;

-- validate_invite_token keeps anon access: the invite landing page needs
-- to resolve a token before the user has signed in.
grant execute on function public.validate_invite_token(uuid) to anon, authenticated;

-- get_alert_emails is reachable at /rest/v1/rpc/get_alert_emails. Its own
-- Unauthorized check already stops an anon caller (get_user_company_id()
-- is null for them), but there is no reason to expose the endpoint at all.
revoke execute on function public.get_alert_emails(uuid) from public, anon;
grant  execute on function public.get_alert_emails(uuid) to authenticated;

-- The role predicates are internal helpers for RLS, not app endpoints, yet
-- PostgREST exposes each one at /rest/v1/rpc/<name> and Postgres's default
-- PUBLIC grant leaves them callable by anon.
--
-- `authenticated` MUST keep EXECUTE: a policy expression is evaluated as
-- the querying role, so revoking it there would break every policy that
-- calls these. service_role is granted too, for edge functions that bypass
-- RLS but may still call them.
revoke execute on function public.is_super_admin()            from public, anon;
revoke execute on function public.get_user_company_id()       from public, anon;
revoke execute on function public.is_company_admin()          from public, anon;
revoke execute on function public.is_admin_of_company(uuid)   from public, anon;

grant execute on function public.is_super_admin()             to authenticated, service_role;
grant execute on function public.get_user_company_id()        to authenticated, service_role;
grant execute on function public.is_company_admin()           to authenticated, service_role;
grant execute on function public.is_admin_of_company(uuid)    to authenticated, service_role;

-- Trigger functions are not callable over RPC (Postgres rejects a direct
-- call to a function returning `trigger`), so these are lint hygiene rather
-- than an open door. Triggers fire regardless of EXECUTE grants.
--
-- Guarded by existence: these live in production but in no repo schema, so
-- a database built purely from this repo will not have them.
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.handle_new_user()',
    'public.broadcast_ticket_alert()',
    'public.handle_notification_event()'
  ] loop
    if to_regprocedure(fn) is not null then
      execute format('revoke execute on function %s from public, anon, authenticated', fn);
    end if;
  end loop;
end;
$$;

commit;
