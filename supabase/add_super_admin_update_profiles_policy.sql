-- ================================================================
-- Allow Super Admins to Update Any Profile
-- ================================================================
-- DESCRIPTION
-- -----------
-- Adds an RLS UPDATE policy on the profiles table so that
-- SUPER_ADMIN users can change the role of any user across
-- all companies (e.g. promoting CREW → ADMIN or vice versa).
--
-- The existing "super_admin_read_all_profiles" policy only
-- covers SELECT; this companion policy covers UPDATE.
--
-- HOW TO RUN
-- ----------
-- 1. Open your Supabase project dashboard
-- 2. Navigate to SQL Editor in the left sidebar
-- 3. Paste and run this script
-- ================================================================

create policy "super_admin_update_profiles" on profiles
  for update to authenticated
  using (is_super_admin())
  with check (is_super_admin());
