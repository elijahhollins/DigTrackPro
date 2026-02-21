-- ============================================================
-- DigTrack Pro — Company Registration & Super-Admin Setup
-- ============================================================
-- Paste this entire script into the Supabase SQL Editor and
-- click "Run". It is safe to run more than once.
--
-- OVERVIEW OF CHANGES
-- -------------------
-- 1. SUPER-ADMIN HELPER FUNCTION  — avoids recursive RLS
-- 2. INVITE TOKEN VALIDATOR       — accessible pre-auth (anon)
-- 3. COMPANY NAME LOOKUP          — accessible pre-auth (anon)
-- 4. COMPANY INVITES TABLE        — stores one-time invite tokens
-- 5. RLS POLICIES                 — super-admin reads all; invites;
--                                   own-profile; company insert
--
-- AFTER RUNNING THIS SCRIPT
-- -------------------------
-- Set yourself as SUPER_ADMIN (replace the placeholder values):
--
--   UPDATE profiles
--   SET role = 'SUPER_ADMIN'
--   WHERE id = 'YOUR-AUTH-USER-UUID';
--
-- Your auth user UUID is visible in Supabase →
--   Authentication → Users → copy the "User UID" column.
-- ============================================================

-- ── 1. SUPER-ADMIN HELPER (SECURITY DEFINER avoids recursive RLS) ─────────

CREATE OR REPLACE FUNCTION is_super_admin() RETURNS boolean
  LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'SUPER_ADMIN'
  )
$$;

-- ── 2. VALIDATE INVITE TOKEN (accessible before sign-in) ──────────────────

CREATE OR REPLACE FUNCTION validate_invite_token(p_token uuid)
  RETURNS TABLE(company_id uuid, company_name text)
  LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT ci.company_id, c.name AS company_name
  FROM   public.company_invites ci
  JOIN   public.companies c ON c.id = ci.company_id
  WHERE  ci.token = p_token AND ci.used_at IS NULL
$$;

-- ── 3. LOOK UP COMPANY BY NAME (accessible before sign-in) ────────────────

CREATE OR REPLACE FUNCTION get_company_by_name(p_name text)
  RETURNS TABLE(company_id uuid, company_name text, brand_color text)
  LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT id, name, brand_color
  FROM   public.companies
  WHERE  lower(name) = lower(p_name)
  LIMIT  1
$$;

-- Grant function access
GRANT EXECUTE ON FUNCTION is_super_admin         TO authenticated;
GRANT EXECUTE ON FUNCTION validate_invite_token  TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_company_by_name    TO anon, authenticated;

-- ── 4. COMPANY INVITES TABLE ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS company_invites (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  token      uuid UNIQUE DEFAULT gen_random_uuid() NOT NULL,
  used_at    timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
);

ALTER TABLE company_invites ENABLE ROW LEVEL SECURITY;
GRANT ALL ON company_invites TO authenticated;

-- ── 5. RLS POLICIES ───────────────────────────────────────────────────────

-- Allow authenticated users to INSERT a new company
-- (needed for first-time bootstrap before SUPER_ADMIN is assigned)
DROP POLICY IF EXISTS "allow_company_insert" ON companies;
CREATE POLICY "allow_company_insert" ON companies
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Allow each user to always read/write their own profile row
-- (critical during onboarding when company_id is still NULL)
DROP POLICY IF EXISTS "allow_own_profile" ON profiles;
CREATE POLICY "allow_own_profile" ON profiles
  FOR ALL TO authenticated
  USING  (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Super-admin can SELECT all profiles across every tenant
DROP POLICY IF EXISTS "super_admin_read_all_profiles" ON profiles;
CREATE POLICY "super_admin_read_all_profiles" ON profiles
  FOR SELECT TO authenticated
  USING (is_super_admin());

-- Super-admin can SELECT all companies
DROP POLICY IF EXISTS "super_admin_read_all_companies" ON companies;
CREATE POLICY "super_admin_read_all_companies" ON companies
  FOR SELECT TO authenticated
  USING (is_super_admin());

-- Super-admin has full access to company_invites
DROP POLICY IF EXISTS "super_admin_manage_invites" ON company_invites;
CREATE POLICY "super_admin_manage_invites" ON company_invites
  FOR ALL TO authenticated
  USING  (is_super_admin())
  WITH CHECK (is_super_admin());

-- Any authenticated user can mark an unused invite as used (during onboarding)
DROP POLICY IF EXISTS "mark_invite_used" ON company_invites;
CREATE POLICY "mark_invite_used" ON company_invites
  FOR UPDATE TO authenticated
  USING  (used_at IS NULL)
  WITH CHECK (true);
