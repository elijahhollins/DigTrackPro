-- ================================================================
-- DigTrack Pro — Complete Database Setup
-- ================================================================
-- HOW TO RUN
-- ----------
-- 1. Open your Supabase project dashboard
-- 2. Click "SQL Editor" in the left sidebar
-- 3. Click "New query"
-- 4. Copy EVERYTHING below this box and paste it in
-- 5. Click the green "Run" button (or press Ctrl+Enter)
-- 6. You should see "Success. No rows returned."
--
-- THEN — promote yourself to Super Admin (see very bottom of file)
--
-- SAFE TO RE-RUN: every statement uses IF NOT EXISTS / OR REPLACE /
-- DROP IF EXISTS so running it more than once won't break anything.
-- ================================================================


-- ────────────────────────────────────────────────────────────────
-- STEP 1 — CORE TABLES
-- ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS companies (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name       text NOT NULL,
    brand_color text DEFAULT '#3b82f6',
    created_at  timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS profiles (
    id         uuid PRIMARY KEY,
    company_id uuid REFERENCES companies(id),
    name       text,
    username   text,
    role       text
);

CREATE TABLE IF NOT EXISTS jobs (
    id         uuid PRIMARY KEY,
    company_id uuid REFERENCES companies(id) NOT NULL,
    job_number text,
    customer   text,
    address    text,
    city       text,
    state      text,
    county     text,
    is_complete boolean DEFAULT false,
    created_at  timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tickets (
    id               uuid PRIMARY KEY,
    company_id       uuid REFERENCES companies(id) NOT NULL,
    job_number       text,
    ticket_no        text,
    street           text,
    cross_street     text,
    place            text,
    extent           text,
    county           text,
    city             text,
    state            text,
    call_in_date     text,
    work_date        text,
    expires          text,
    site_contact     text,
    refresh_requested boolean DEFAULT false,
    no_show_requested boolean DEFAULT false,
    is_archived      boolean DEFAULT false,
    document_url     text,
    created_at       timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS job_prints (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id   uuid REFERENCES companies(id) NOT NULL,
    job_number   text NOT NULL,
    storage_path text NOT NULL,
    file_name    text NOT NULL,
    is_pinned    boolean DEFAULT true,
    created_at   timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS print_markers (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    print_id   uuid REFERENCES job_prints(id) ON DELETE CASCADE,
    ticket_id  uuid REFERENCES tickets(id)    ON DELETE CASCADE,
    x_percent  float8 NOT NULL,
    y_percent  float8 NOT NULL,
    page_number int4  DEFAULT 1,
    label      text,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS photos (
    id         uuid PRIMARY KEY,
    company_id uuid REFERENCES companies(id) NOT NULL,
    job_number text,
    data_url   text,
    caption    text,
    created_at timestamp with time zone DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notes (
    id         uuid PRIMARY KEY,
    company_id uuid REFERENCES companies(id) NOT NULL,
    job_number text,
    text       text,
    author     text,
    timestamp  bigint
);

CREATE TABLE IF NOT EXISTS no_shows (
    id         uuid PRIMARY KEY,
    company_id uuid REFERENCES companies(id) NOT NULL,
    ticket_id  uuid REFERENCES tickets(id) ON DELETE CASCADE,
    job_number text,
    utilities  text[],
    companies  text,
    author     text,
    timestamp  bigint
);

CREATE TABLE IF NOT EXISTS company_invites (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
    token      uuid UNIQUE DEFAULT gen_random_uuid() NOT NULL,
    used_at    timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);


-- ────────────────────────────────────────────────────────────────
-- STEP 2 — ENABLE ROW LEVEL SECURITY ON ALL TABLES
-- ────────────────────────────────────────────────────────────────

ALTER TABLE companies       ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets         ENABLE ROW LEVEL SECURITY;
ALTER TABLE photos          ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE no_shows        ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_prints      ENABLE ROW LEVEL SECURITY;
ALTER TABLE print_markers   ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_invites ENABLE ROW LEVEL SECURITY;


-- ────────────────────────────────────────────────────────────────
-- STEP 3 — SECURITY-DEFINER HELPER FUNCTIONS
--
-- These run with elevated privileges to avoid Postgres's
-- "infinite recursion" error that happens when an RLS policy
-- queries the same table it is protecting.
-- ────────────────────────────────────────────────────────────────

-- Returns true if the currently signed-in user has SUPER_ADMIN role
CREATE OR REPLACE FUNCTION is_super_admin()
  RETURNS boolean
  LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'SUPER_ADMIN'
  )
$$;

-- Validates a one-time invite token; returns the company it belongs to.
-- Callable by un-authenticated users (anon) so the sign-up page can
-- show the company name before the new admin creates their account.
CREATE OR REPLACE FUNCTION validate_invite_token(p_token uuid)
  RETURNS TABLE(company_id uuid, company_name text)
  LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT ci.company_id, c.name AS company_name
  FROM   public.company_invites ci
  JOIN   public.companies c ON c.id = ci.company_id
  WHERE  ci.token = p_token AND ci.used_at IS NULL
$$;

-- Looks up a company by name (case-insensitive).
-- Also callable by un-authenticated users so new crew members can
-- find their company during sign-up before they have a session.
CREATE OR REPLACE FUNCTION get_company_by_name(p_name text)
  RETURNS TABLE(company_id uuid, company_name text, brand_color text)
  LANGUAGE sql SECURITY DEFINER STABLE AS $$
  SELECT id, name, brand_color
  FROM   public.companies
  WHERE  lower(name) = lower(p_name)
  LIMIT  1
$$;

-- Grant execution rights
GRANT EXECUTE ON FUNCTION is_super_admin        TO authenticated;
GRANT EXECUTE ON FUNCTION validate_invite_token TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_company_by_name   TO anon, authenticated;


-- ────────────────────────────────────────────────────────────────
-- STEP 4 — ROW LEVEL SECURITY POLICIES
--
-- DROP before CREATE so re-running this script never errors.
-- ────────────────────────────────────────────────────────────────

-- ── profiles ────────────────────────────────────────────────────

-- Every user can always read / write their OWN profile row.
-- (Needed during onboarding when company_id is still NULL.)
DROP POLICY IF EXISTS "allow_own_profile"            ON profiles;
CREATE POLICY        "allow_own_profile"             ON profiles
  FOR ALL TO authenticated
  USING  (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Regular users only see teammates inside their own company.
DROP POLICY IF EXISTS "tenant_isolation_profiles"    ON profiles;
CREATE POLICY        "tenant_isolation_profiles"     ON profiles
  FOR ALL TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

-- Super-admin sees ALL profiles across every company.
DROP POLICY IF EXISTS "super_admin_read_all_profiles" ON profiles;
CREATE POLICY        "super_admin_read_all_profiles"  ON profiles
  FOR SELECT TO authenticated
  USING (is_super_admin());

-- ── companies ───────────────────────────────────────────────────

-- Regular users see only their own company.
DROP POLICY IF EXISTS "tenant_isolation_companies"   ON companies;
CREATE POLICY        "tenant_isolation_companies"    ON companies
  FOR SELECT TO authenticated
  USING (id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

-- Any signed-in user can CREATE a company (needed for first-time
-- bootstrap before anyone is a SUPER_ADMIN yet).
DROP POLICY IF EXISTS "allow_company_insert"         ON companies;
CREATE POLICY        "allow_company_insert"          ON companies
  FOR INSERT TO authenticated
  WITH CHECK (true);

-- Super-admin sees ALL companies.
DROP POLICY IF EXISTS "super_admin_read_all_companies" ON companies;
CREATE POLICY        "super_admin_read_all_companies"  ON companies
  FOR SELECT TO authenticated
  USING (is_super_admin());

-- ── jobs ────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "tenant_isolation_jobs"        ON jobs;
CREATE POLICY        "tenant_isolation_jobs"         ON jobs
  FOR ALL TO authenticated
  USING      (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

-- ── tickets ─────────────────────────────────────────────────────

DROP POLICY IF EXISTS "tenant_isolation_tickets"     ON tickets;
CREATE POLICY        "tenant_isolation_tickets"      ON tickets
  FOR ALL TO authenticated
  USING      (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

-- ── photos ──────────────────────────────────────────────────────

DROP POLICY IF EXISTS "tenant_isolation_photos"      ON photos;
CREATE POLICY        "tenant_isolation_photos"       ON photos
  FOR ALL TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

-- ── notes ───────────────────────────────────────────────────────

DROP POLICY IF EXISTS "tenant_isolation_notes"       ON notes;
CREATE POLICY        "tenant_isolation_notes"        ON notes
  FOR ALL TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

-- ── no_shows ────────────────────────────────────────────────────

DROP POLICY IF EXISTS "tenant_isolation_no_shows"    ON no_shows;
CREATE POLICY        "tenant_isolation_no_shows"     ON no_shows
  FOR ALL TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

-- ── job_prints ──────────────────────────────────────────────────

DROP POLICY IF EXISTS "tenant_isolation_job_prints"  ON job_prints;
CREATE POLICY        "tenant_isolation_job_prints"   ON job_prints
  FOR ALL TO authenticated
  USING (company_id = (SELECT company_id FROM profiles WHERE id = auth.uid()));

-- ── print_markers — no company_id, secured via parent job_print ─

DROP POLICY IF EXISTS "tenant_isolation_print_markers" ON print_markers;
CREATE POLICY        "tenant_isolation_print_markers"  ON print_markers
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.job_prints jp
      WHERE jp.id = print_markers.print_id
        AND jp.company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    )
  );

-- ── company_invites ─────────────────────────────────────────────

-- Super-admin creates and manages all invite tokens.
DROP POLICY IF EXISTS "super_admin_manage_invites"   ON company_invites;
CREATE POLICY        "super_admin_manage_invites"    ON company_invites
  FOR ALL TO authenticated
  USING  (is_super_admin())
  WITH CHECK (is_super_admin());

-- Any signed-in user can mark an unused invite as used (during onboarding).
DROP POLICY IF EXISTS "mark_invite_used"             ON company_invites;
CREATE POLICY        "mark_invite_used"              ON company_invites
  FOR UPDATE TO authenticated
  USING  (used_at IS NULL)
  WITH CHECK (true);


-- ────────────────────────────────────────────────────────────────
-- STEP 5 — GRANT TABLE ACCESS TO AUTHENTICATED USERS
-- ────────────────────────────────────────────────────────────────

GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;


-- ================================================================
-- DONE! The script has finished.
--
-- ────────────────────────────────────────────────────────────────
-- FINAL STEP — PROMOTE YOURSELF TO SUPER ADMIN
-- ────────────────────────────────────────────────────────────────
-- 1. In Supabase, go to Authentication → Users
-- 2. Find your account and copy the value in the "User UID" column
-- 3. Open a NEW query in the SQL Editor
-- 4. Paste and run the statement below, replacing the placeholder:
--
--   UPDATE profiles
--   SET    role = 'SUPER_ADMIN'
--   WHERE  id   = 'PASTE-YOUR-USER-UUID-HERE';
--
-- After that, refresh the app — you will see the
-- "Platform Admin · Companies" panel on the Team page.
-- ================================================================
