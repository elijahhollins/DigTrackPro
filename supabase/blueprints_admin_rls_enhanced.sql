-- ================================================================
-- DigTrack Pro — Blueprint Admin RLS Enhancement
-- ================================================================
-- DESCRIPTION
-- -----------
-- This script restricts blueprint (job_prints) and print marker
-- write operations to company ADMIN and SUPER_ADMIN roles only.
-- Regular CREW members can still view blueprints and markers but
-- cannot upload, replace, or delete them.
--
-- HOW TO RUN
-- ----------
-- 1. Ensure complete_rls_setup.sql has already been applied.
-- 2. Open your Supabase project dashboard.
-- 3. Navigate to SQL Editor in the left sidebar.
-- 4. Create a new query.
-- 5. Copy and paste this ENTIRE file.
-- 6. Click "Run" (or press Ctrl/Cmd+Enter).
-- 7. You should see "Success. No rows returned."
--
-- SAFE TO RE-RUN: All statements use OR REPLACE or DROP IF EXISTS,
-- so running multiple times won't cause errors.
-- ================================================================


-- ────────────────────────────────────────────────────────────────
-- STEP 1 — ADMIN HELPER FUNCTIONS
-- ────────────────────────────────────────────────────────────────

-- Check if the current user is an ADMIN or SUPER_ADMIN in their company.
-- SECURITY DEFINER: runs with the definer's privileges to bypass RLS on
-- the profiles table. Uses explicit schema qualification (public.profiles)
-- and auth.uid() to safely identify the caller.
CREATE OR REPLACE FUNCTION is_company_admin()
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  STABLE AS $$
    SELECT EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('ADMIN', 'SUPER_ADMIN')
    )
$$;

-- Check if the current user is an ADMIN or SUPER_ADMIN of a specific company.
-- Intended for application-level permission checks (e.g. TypeScript/RPC calls)
-- where a caller needs to verify admin rights over an arbitrary company UUID,
-- such as SUPER_ADMIN flows that span multiple tenants.
-- SECURITY DEFINER: same safety model as is_company_admin() above.
CREATE OR REPLACE FUNCTION is_admin_of_company(p_company_id uuid)
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  STABLE AS $$
    SELECT EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE id = auth.uid()
        AND company_id = p_company_id
        AND role IN ('ADMIN', 'SUPER_ADMIN')
    )
$$;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION is_company_admin()              TO authenticated;
GRANT EXECUTE ON FUNCTION is_admin_of_company(uuid)       TO authenticated;


-- ────────────────────────────────────────────────────────────────
-- STEP 2 — DROP EXISTING JOB_PRINTS AND PRINT_MARKERS POLICIES
-- ────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "tenant_isolation_job_prints"    ON job_prints;
DROP POLICY IF EXISTS "tenant_isolation_print_markers" ON print_markers;


-- ────────────────────────────────────────────────────────────────
-- STEP 3 — JOB_PRINTS POLICIES (Admin write, all read)
-- ────────────────────────────────────────────────────────────────

-- All company members can view blueprints
CREATE POLICY "job_prints_select"
  ON job_prints
  FOR SELECT
  TO authenticated
  USING (company_id = get_user_company_id());

-- Only ADMINs/SUPER_ADMINs can upload new blueprints
CREATE POLICY "job_prints_insert_admin"
  ON job_prints
  FOR INSERT
  TO authenticated
  WITH CHECK (
    company_id = get_user_company_id()
    AND is_company_admin()
  );

-- Only ADMINs/SUPER_ADMINs can update blueprints (e.g. pin/unpin)
CREATE POLICY "job_prints_update_admin"
  ON job_prints
  FOR UPDATE
  TO authenticated
  USING (
    company_id = get_user_company_id()
    AND is_company_admin()
  )
  WITH CHECK (
    company_id = get_user_company_id()
    AND is_company_admin()
  );

-- Only ADMINs/SUPER_ADMINs can delete blueprints
CREATE POLICY "job_prints_delete_admin"
  ON job_prints
  FOR DELETE
  TO authenticated
  USING (
    company_id = get_user_company_id()
    AND is_company_admin()
  );


-- ────────────────────────────────────────────────────────────────
-- STEP 4 — PRINT_MARKERS POLICIES (Admin write, all read)
-- ────────────────────────────────────────────────────────────────

-- All company members can view markers
CREATE POLICY "print_markers_select"
  ON print_markers
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.job_prints jp
      WHERE jp.id = print_markers.print_id
        AND jp.company_id = get_user_company_id()
    )
  );

-- Only ADMINs/SUPER_ADMINs can add markers
CREATE POLICY "print_markers_insert_admin"
  ON print_markers
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.job_prints jp
      WHERE jp.id = print_markers.print_id
        AND jp.company_id = get_user_company_id()
    )
    AND is_company_admin()
  );

-- Only ADMINs/SUPER_ADMINs can update markers
CREATE POLICY "print_markers_update_admin"
  ON print_markers
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.job_prints jp
      WHERE jp.id = print_markers.print_id
        AND jp.company_id = get_user_company_id()
    )
    AND is_company_admin()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.job_prints jp
      WHERE jp.id = print_markers.print_id
        AND jp.company_id = get_user_company_id()
    )
    AND is_company_admin()
  );

-- Only ADMINs/SUPER_ADMINs can delete markers
CREATE POLICY "print_markers_delete_admin"
  ON print_markers
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.job_prints jp
      WHERE jp.id = print_markers.print_id
        AND jp.company_id = get_user_company_id()
    )
    AND is_company_admin()
  );


-- ────────────────────────────────────────────────────────────────
-- STEP 5 — PROFILES POLICIES (Admins can manage team roles)
-- ────────────────────────────────────────────────────────────────

-- Allow company admins to update other team members' profiles
-- (excluding their own profile, which is already covered by allow_own_profile)
DROP POLICY IF EXISTS "admin_manage_team_profiles" ON profiles;

CREATE POLICY "admin_manage_team_profiles"
  ON profiles
  FOR UPDATE
  TO authenticated
  USING (
    company_id = get_user_company_id()
    AND id <> auth.uid()
    AND is_company_admin()
  )
  WITH CHECK (
    company_id = get_user_company_id()
    AND id <> auth.uid()
    AND is_company_admin()
  );


-- ================================================================
-- SETUP COMPLETE!
-- ================================================================
--
-- Access levels after this change:
--
--   Operation            | CREW | ADMIN | SUPER_ADMIN
--   ---------------------|------|-------|------------
--   View Blueprints      |  ✅  |  ✅   |     ✅
--   Add Blueprint        |  ❌  |  ✅   |     ✅
--   Edit Blueprint       |  ❌  |  ✅   |     ✅
--   Delete Blueprint     |  ❌  |  ✅   |     ✅
--   Add/Delete Markers   |  ❌  |  ✅   |     ✅
--   Manage Team Roles    |  ❌  |  ✅   |     ✅
--
-- ================================================================
