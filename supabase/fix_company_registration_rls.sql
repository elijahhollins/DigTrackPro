-- ============================================================
-- Fix: Company Registration Flow - Missing RLS Policies
-- ============================================================
-- Run this script once in the Supabase SQL Editor.
-- It is safe to run multiple times (uses DROP IF EXISTS before CREATE).
--
-- Problem 1: New users could not INSERT a company because the
--            companies table only had a SELECT policy.
--
-- Problem 2: New users with a NULL company_id were blocked from
--            reading or updating their own profile row because
--            the tenant_isolation_profiles policy evaluates
--            NULL = NULL as false in SQL.
-- ============================================================

-- 1. Allow any authenticated user to INSERT a new company.
--    This is needed during onboarding before a company_id exists.
DROP POLICY IF EXISTS "allow_company_insert" ON companies;
CREATE POLICY "allow_company_insert" ON companies
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- 2. Allow each user to always read and write their own profile row,
--    regardless of whether company_id is set yet.
--    This unblocks the updateUserCompany call during registration.
DROP POLICY IF EXISTS "allow_own_profile" ON profiles;
CREATE POLICY "allow_own_profile" ON profiles
  FOR ALL TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());
