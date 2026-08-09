-- ================================================================
-- Rollback for 20260807000000_lock_down_profile_roles.sql
-- ================================================================
-- ⚠️  RUNNING THIS REOPENS THE PRIVILEGE ESCALATION.
--
-- `allow_own_profile` below is FOR ALL with no column restriction on
-- `role`, which is exactly the hole the migration closed: any signed-in
-- user can then run
--
--   supabase.from('profiles').update({ role: 'SUPER_ADMIN' })
--                            .eq('id', <their own uid>)
--
-- Use this only to unblock a production outage, and prefer fixing
-- forward. Rolling the FRONTEND back is usually the safer lever: the old
-- client and the hardened database are compatible for everything except
-- onboarding, which is the only path that needs the new RPCs.
--
-- Captured from production (project fusubnzndmngjfgatzrq) immediately
-- before the migration was applied on 2026-08-09.
-- ================================================================

begin;

-- 1. Drop the guard trigger. On its own this restores the ability to
--    write role and company_id directly, which may be all you need.
drop trigger if exists profiles_guard_privileged_columns on profiles;

-- 2. Drop the hardened policies.
do $$
declare
  pol record;
begin
  for pol in
    select policyname, tablename from pg_policies
    where schemaname = 'public'
      and tablename in ('profiles', 'company_invites')
  loop
    execute format('drop policy if exists %I on public.%I', pol.policyname, pol.tablename);
  end loop;
end;
$$;

-- 3. Restore the original policies, verbatim as they existed.

CREATE POLICY "allow_own_profile" ON public.profiles
  AS PERMISSIVE FOR ALL TO authenticated
  USING ((id = auth.uid())) WITH CHECK ((id = auth.uid()));

CREATE POLICY "allow_own_password_management" ON public.profiles
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((id = auth.uid())) WITH CHECK ((id = auth.uid()));

CREATE POLICY "allow_own_profile_name_update" ON public.profiles
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((id = auth.uid())) WITH CHECK ((id = auth.uid()));

CREATE POLICY "view_company_profiles" ON public.profiles
  AS PERMISSIVE FOR SELECT TO authenticated
  USING ((company_id = get_user_company_id()));

CREATE POLICY "admin_manage_company_roles" ON public.profiles
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((company_id = get_user_company_id()) AND is_company_admin() AND (id <> auth.uid())))
  WITH CHECK (((company_id = get_user_company_id()) AND is_company_admin()));

CREATE POLICY "allow_admin_update_user_name" ON public.profiles
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((company_id = get_user_company_id()) AND (( SELECT profiles_1.role
     FROM profiles profiles_1
    WHERE (profiles_1.id = auth.uid())) = 'ADMIN'::text)))
  WITH CHECK (((company_id = get_user_company_id()) AND (( SELECT profiles_1.role
     FROM profiles profiles_1
    WHERE (profiles_1.id = auth.uid())) = 'ADMIN'::text)));

CREATE POLICY "super_admin_manage_all_profiles" ON public.profiles
  AS PERMISSIVE FOR ALL TO authenticated
  USING (is_super_admin()) WITH CHECK (is_super_admin());

CREATE POLICY "allow_admin_create_invites" ON public.company_invites
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((company_id = get_user_company_id()) AND (( SELECT profiles.role
     FROM profiles
    WHERE (profiles.id = auth.uid())) = 'ADMIN'::text)));

CREATE POLICY "allow_admin_view_invites" ON public.company_invites
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (((company_id = get_user_company_id()) AND (( SELECT profiles.role
     FROM profiles
    WHERE (profiles.id = auth.uid())) = ANY (ARRAY['ADMIN'::text, 'SUPER_ADMIN'::text]))));

CREATE POLICY "mark_invite_used" ON public.company_invites
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((used_at IS NULL)) WITH CHECK (true);

CREATE POLICY "super_admin_manage_invites" ON public.company_invites
  AS PERMISSIVE FOR ALL TO authenticated
  USING (is_super_admin()) WITH CHECK (is_super_admin());

commit;

-- Deliberately NOT reverted, because none of it is load-bearing for the
-- old client and all of it is strictly protective:
--   * the profiles_role_valid CHECK constraint
--   * pinned search_path on the SECURITY DEFINER functions
--   * revoked anon EXECUTE grants
--   * the new RPCs (harmless if unused)
--
-- To drop the constraint as well:
--   alter table profiles drop constraint if exists profiles_role_valid;
