-- ================================================================
-- DigTrack Pro — Complete RLS Setup (Enhanced)
-- ================================================================
-- DESCRIPTION
-- -----------
-- This script provides comprehensive Row Level Security policies
-- for a multi-tenant SaaS application with company isolation.
--
-- KEY FEATURES:
-- • Complete tenant isolation (users only see their company's data)
-- • Super Admin role with cross-company access
-- • Secure company registration and onboarding flow
-- • Security-definer functions to avoid RLS recursion
-- • Support for company invites and team management
-- • Push notification subscriptions per user
--
-- HOW TO RUN
-- ----------
-- 1. Open your Supabase project dashboard
-- 2. Navigate to SQL Editor in the left sidebar
-- 3. Create a new query
-- 4. Copy and paste this ENTIRE file
-- 5. Click "Run" (or press Ctrl/Cmd+Enter)
-- 6. You should see "Success. No rows returned."
--
-- SAFE TO RE-RUN: All statements use IF NOT EXISTS, OR REPLACE,
-- or DROP IF EXISTS, so running multiple times won't cause errors.
-- ================================================================


-- ────────────────────────────────────────────────────────────────
-- STEP 1 — DROP EXISTING POLICIES (Clean Slate)
-- ────────────────────────────────────────────────────────────────

DO $$ 
DECLARE 
    r RECORD;
BEGIN
    FOR r IN (
        SELECT policyname, tablename 
        FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename IN (
            'companies', 'profiles', 'jobs', 'tickets', 
            'photos', 'notes', 'no_shows', 'push_subscriptions', 
            'job_prints', 'print_markers', 'company_invites'
        )
    ) LOOP
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) 
                || ' ON ' || quote_ident(r.tablename);
    END LOOP;
END $$;


-- ────────────────────────────────────────────────────────────────
-- STEP 2 — CREATE TABLES
-- ────────────────────────────────────────────────────────────────

-- Companies table — the root of the multi-tenant hierarchy
CREATE TABLE IF NOT EXISTS companies (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text NOT NULL UNIQUE,
    brand_color text DEFAULT '#3b82f6',
    created_at  timestamp with time zone DEFAULT now()
);

-- User profiles — linked to auth.users and companies
CREATE TABLE IF NOT EXISTS profiles (
    id         uuid PRIMARY KEY,  -- matches auth.users.id
    company_id uuid REFERENCES companies(id) ON DELETE SET NULL,
    name       text,
    username   text,
    role       text DEFAULT 'CREW',
    created_at timestamp with time zone DEFAULT now()
);

-- Jobs table — construction projects
CREATE TABLE IF NOT EXISTS jobs (
    id          uuid PRIMARY KEY,
    company_id  uuid REFERENCES companies(id) NOT NULL,
    job_number  text NOT NULL,
    customer    text,
    address     text,
    city        text,
    state       text,
    county      text,
    is_complete boolean DEFAULT false,
    created_at  timestamp with time zone DEFAULT now()
);

-- Tickets table — dig tickets for utility work
CREATE TABLE IF NOT EXISTS tickets (
    id                uuid PRIMARY KEY,
    company_id        uuid REFERENCES companies(id) NOT NULL,
    job_number        text NOT NULL,
    ticket_no         text NOT NULL,
    street            text,
    cross_street      text,
    place             text,
    extent            text,
    county            text,
    city              text,
    state             text,
    call_in_date      text,
    work_date         text,
    expires           text,
    site_contact      text,
    refresh_requested boolean DEFAULT false,
    no_show_requested boolean DEFAULT false,
    is_archived       boolean DEFAULT false,
    document_url      text,
    created_at        timestamp with time zone DEFAULT now()
);

-- Job prints — uploaded PDF/image files for jobs
CREATE TABLE IF NOT EXISTS job_prints (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id   uuid REFERENCES companies(id) NOT NULL,
    job_number   text NOT NULL,
    storage_path text NOT NULL,
    file_name    text NOT NULL,
    is_pinned    boolean DEFAULT true,
    created_at   timestamp with time zone DEFAULT now()
);

-- Print markers — annotations on job prints
CREATE TABLE IF NOT EXISTS print_markers (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    print_id    uuid REFERENCES job_prints(id) ON DELETE CASCADE,
    ticket_id   uuid REFERENCES tickets(id) ON DELETE CASCADE,
    x_percent   float8 NOT NULL,
    y_percent   float8 NOT NULL,
    page_number int4 DEFAULT 1,
    label       text,
    created_at  timestamp with time zone DEFAULT now()
);

-- Photos table — job site photos
CREATE TABLE IF NOT EXISTS photos (
    id         uuid PRIMARY KEY,
    company_id uuid REFERENCES companies(id) NOT NULL,
    job_number text NOT NULL,
    data_url   text,
    caption    text,
    created_at timestamp with time zone DEFAULT now()
);

-- Notes table — text notes for jobs
CREATE TABLE IF NOT EXISTS notes (
    id         uuid PRIMARY KEY,
    company_id uuid REFERENCES companies(id) NOT NULL,
    job_number text NOT NULL,
    text       text,
    author     text,
    timestamp  bigint
);

-- No-shows table — tracking missed utility markings
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

-- Company invites — one-time tokens for onboarding new admins
CREATE TABLE IF NOT EXISTS company_invites (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id uuid REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
    token      uuid UNIQUE DEFAULT gen_random_uuid() NOT NULL,
    used_at    timestamp with time zone,
    created_at timestamp with time zone DEFAULT now()
);

-- Push subscriptions — web push notification endpoints
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           uuid REFERENCES profiles(id) ON DELETE CASCADE,
    company_id        uuid REFERENCES companies(id) ON DELETE CASCADE,
    subscription_json text NOT NULL,
    created_at        timestamp with time zone DEFAULT now(),
    UNIQUE(user_id, subscription_json)
);


-- ────────────────────────────────────────────────────────────────
-- STEP 3 — ENABLE ROW LEVEL SECURITY
-- ────────────────────────────────────────────────────────────────

ALTER TABLE companies          ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs               ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets            ENABLE ROW LEVEL SECURITY;
ALTER TABLE photos             ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes              ENABLE ROW LEVEL SECURITY;
ALTER TABLE no_shows           ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_prints         ENABLE ROW LEVEL SECURITY;
ALTER TABLE print_markers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_invites    ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;


-- ────────────────────────────────────────────────────────────────
-- STEP 4 — SECURITY-DEFINER HELPER FUNCTIONS
--
-- These functions run with elevated privileges to avoid
-- "infinite recursion detected in policy for relation" errors
-- that occur when RLS policies query the same table they protect.
-- ────────────────────────────────────────────────────────────────

-- Check if current user is a Super Admin
CREATE OR REPLACE FUNCTION is_super_admin()
  RETURNS boolean
  LANGUAGE sql 
  SECURITY DEFINER 
  STABLE AS $$
    SELECT EXISTS (
      SELECT 1 
      FROM public.profiles 
      WHERE id = auth.uid() 
        AND role = 'SUPER_ADMIN'
    )
$$;

-- Get the company_id for the current user
CREATE OR REPLACE FUNCTION get_user_company_id()
  RETURNS uuid
  LANGUAGE sql
  SECURITY DEFINER
  STABLE AS $$
    SELECT company_id 
    FROM public.profiles 
    WHERE id = auth.uid()
$$;

-- Validate an invite token and return company info
CREATE OR REPLACE FUNCTION validate_invite_token(p_token uuid)
  RETURNS TABLE(company_id uuid, company_name text)
  LANGUAGE sql 
  SECURITY DEFINER 
  STABLE AS $$
    SELECT ci.company_id, c.name AS company_name
    FROM   public.company_invites ci
    JOIN   public.companies c ON c.id = ci.company_id
    WHERE  ci.token = p_token 
      AND  ci.used_at IS NULL
$$;

-- Look up a company by name (case-insensitive)
CREATE OR REPLACE FUNCTION get_company_by_name(p_name text)
  RETURNS TABLE(company_id uuid, company_name text, brand_color text)
  LANGUAGE sql 
  SECURITY DEFINER 
  STABLE AS $$
    SELECT id, name, brand_color
    FROM   public.companies
    WHERE  lower(name) = lower(p_name)
    LIMIT  1
$$;

-- Grant execution permissions
GRANT EXECUTE ON FUNCTION is_super_admin()        TO authenticated;
GRANT EXECUTE ON FUNCTION get_user_company_id()   TO authenticated;
GRANT EXECUTE ON FUNCTION validate_invite_token(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_company_by_name(text)   TO anon, authenticated;


-- ────────────────────────────────────────────────────────────────
-- STEP 5 — ROW LEVEL SECURITY POLICIES
-- ────────────────────────────────────────────────────────────────

-- ══════════════════════════════════════════════════════════════
-- PROFILES TABLE POLICIES
-- ══════════════════════════════════════════════════════════════

-- Users can always read and modify their own profile
-- (Critical for onboarding when company_id is still NULL)
CREATE POLICY "allow_own_profile" 
  ON profiles
  FOR ALL 
  TO authenticated
  USING  (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Users can see teammates within their company
CREATE POLICY "tenant_isolation_profiles" 
  ON profiles
  FOR ALL 
  TO authenticated
  USING (company_id = get_user_company_id());

-- Super admins can see all profiles across all companies
CREATE POLICY "super_admin_read_all_profiles" 
  ON profiles
  FOR SELECT 
  TO authenticated
  USING (is_super_admin());


-- ══════════════════════════════════════════════════════════════
-- COMPANIES TABLE POLICIES
-- ══════════════════════════════════════════════════════════════

-- Users can see their own company
CREATE POLICY "tenant_isolation_companies" 
  ON companies
  FOR SELECT 
  TO authenticated
  USING (id = get_user_company_id());

-- Any authenticated user can create a company
-- (Needed for first-time setup before any super admin exists)
CREATE POLICY "allow_company_insert" 
  ON companies
  FOR INSERT 
  TO authenticated
  WITH CHECK (true);

-- Super admins can see all companies
CREATE POLICY "super_admin_read_all_companies" 
  ON companies
  FOR SELECT 
  TO authenticated
  USING (is_super_admin());

-- Super admins can update any company
CREATE POLICY "super_admin_update_companies"
  ON companies
  FOR UPDATE
  TO authenticated
  USING (is_super_admin())
  WITH CHECK (is_super_admin());


-- ══════════════════════════════════════════════════════════════
-- JOBS TABLE POLICIES
-- ══════════════════════════════════════════════════════════════

CREATE POLICY "tenant_isolation_jobs" 
  ON jobs
  FOR ALL 
  TO authenticated
  USING      (company_id = get_user_company_id())
  WITH CHECK (company_id = get_user_company_id());


-- ══════════════════════════════════════════════════════════════
-- TICKETS TABLE POLICIES
-- ══════════════════════════════════════════════════════════════

CREATE POLICY "tenant_isolation_tickets" 
  ON tickets
  FOR ALL 
  TO authenticated
  USING      (company_id = get_user_company_id())
  WITH CHECK (company_id = get_user_company_id());


-- ══════════════════════════════════════════════════════════════
-- PHOTOS TABLE POLICIES
-- ══════════════════════════════════════════════════════════════

CREATE POLICY "tenant_isolation_photos" 
  ON photos
  FOR ALL 
  TO authenticated
  USING      (company_id = get_user_company_id())
  WITH CHECK (company_id = get_user_company_id());


-- ══════════════════════════════════════════════════════════════
-- NOTES TABLE POLICIES
-- ══════════════════════════════════════════════════════════════

CREATE POLICY "tenant_isolation_notes" 
  ON notes
  FOR ALL 
  TO authenticated
  USING      (company_id = get_user_company_id())
  WITH CHECK (company_id = get_user_company_id());


-- ══════════════════════════════════════════════════════════════
-- NO_SHOWS TABLE POLICIES
-- ══════════════════════════════════════════════════════════════

CREATE POLICY "tenant_isolation_no_shows" 
  ON no_shows
  FOR ALL 
  TO authenticated
  USING      (company_id = get_user_company_id())
  WITH CHECK (company_id = get_user_company_id());


-- ══════════════════════════════════════════════════════════════
-- JOB_PRINTS TABLE POLICIES
-- ══════════════════════════════════════════════════════════════

CREATE POLICY "tenant_isolation_job_prints" 
  ON job_prints
  FOR ALL 
  TO authenticated
  USING      (company_id = get_user_company_id())
  WITH CHECK (company_id = get_user_company_id());


-- ══════════════════════════════════════════════════════════════
-- PRINT_MARKERS TABLE POLICIES
-- (Secured via parent job_print since it has no company_id)
-- ══════════════════════════════════════════════════════════════

CREATE POLICY "tenant_isolation_print_markers" 
  ON print_markers
  FOR ALL 
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 
      FROM public.job_prints jp
      WHERE jp.id = print_markers.print_id
        AND jp.company_id = get_user_company_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 
      FROM public.job_prints jp
      WHERE jp.id = print_markers.print_id
        AND jp.company_id = get_user_company_id()
    )
  );


-- ══════════════════════════════════════════════════════════════
-- COMPANY_INVITES TABLE POLICIES
-- ══════════════════════════════════════════════════════════════

-- Super admins can manage all invites
CREATE POLICY "super_admin_manage_invites" 
  ON company_invites
  FOR ALL 
  TO authenticated
  USING      (is_super_admin())
  WITH CHECK (is_super_admin());

-- Any authenticated user can mark an invite as used during onboarding
CREATE POLICY "mark_invite_used" 
  ON company_invites
  FOR UPDATE 
  TO authenticated
  USING      (used_at IS NULL)
  WITH CHECK (true);


-- ══════════════════════════════════════════════════════════════
-- PUSH_SUBSCRIPTIONS TABLE POLICIES
-- ══════════════════════════════════════════════════════════════

-- Users can manage their own push subscriptions
CREATE POLICY "allow_own_push_subscriptions" 
  ON push_subscriptions
  FOR ALL 
  TO authenticated
  USING  (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Users can see push subscriptions within their company
-- (Needed for admins to send notifications to team members)
CREATE POLICY "tenant_isolation_push_subscriptions"
  ON push_subscriptions
  FOR SELECT
  TO authenticated
  USING (company_id = get_user_company_id());


-- ────────────────────────────────────────────────────────────────
-- STEP 6 — GRANT TABLE ACCESS
-- ────────────────────────────────────────────────────────────────

GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;


-- ────────────────────────────────────────────────────────────────
-- STEP 7 — CREATE INDEXES FOR PERFORMANCE
-- ────────────────────────────────────────────────────────────────

-- Indexes on company_id for faster tenant isolation queries
CREATE INDEX IF NOT EXISTS idx_profiles_company_id      ON profiles(company_id);
CREATE INDEX IF NOT EXISTS idx_jobs_company_id          ON jobs(company_id);
CREATE INDEX IF NOT EXISTS idx_tickets_company_id       ON tickets(company_id);
CREATE INDEX IF NOT EXISTS idx_photos_company_id        ON photos(company_id);
CREATE INDEX IF NOT EXISTS idx_notes_company_id         ON notes(company_id);
CREATE INDEX IF NOT EXISTS idx_no_shows_company_id      ON no_shows(company_id);
CREATE INDEX IF NOT EXISTS idx_job_prints_company_id    ON job_prints(company_id);
CREATE INDEX IF NOT EXISTS idx_push_subs_company_id     ON push_subscriptions(company_id);
CREATE INDEX IF NOT EXISTS idx_company_invites_company  ON company_invites(company_id);

-- Index on invite token for quick lookups
CREATE INDEX IF NOT EXISTS idx_company_invites_token    ON company_invites(token);

-- Indexes on auth.uid() lookups
CREATE INDEX IF NOT EXISTS idx_profiles_id              ON profiles(id);
CREATE INDEX IF NOT EXISTS idx_push_subs_user_id        ON push_subscriptions(user_id);

-- Indexes for job/ticket lookups
CREATE INDEX IF NOT EXISTS idx_jobs_job_number          ON jobs(job_number);
CREATE INDEX IF NOT EXISTS idx_tickets_job_number       ON tickets(job_number);
CREATE INDEX IF NOT EXISTS idx_tickets_ticket_no        ON tickets(ticket_no);
CREATE INDEX IF NOT EXISTS idx_photos_job_number        ON photos(job_number);
CREATE INDEX IF NOT EXISTS idx_notes_job_number         ON notes(job_number);

-- Index for print_markers parent lookups
CREATE INDEX IF NOT EXISTS idx_print_markers_print_id   ON print_markers(print_id);
CREATE INDEX IF NOT EXISTS idx_print_markers_ticket_id  ON print_markers(ticket_id);


-- ================================================================
-- SETUP COMPLETE! 
-- ================================================================
--
-- ────────────────────────────────────────────────────────────────
-- NEXT STEPS
-- ────────────────────────────────────────────────────────────────
--
-- 1. PROMOTE YOURSELF TO SUPER ADMIN
--    Run this query (replace YOUR-USER-UUID with your actual UUID
--    from Authentication → Users in the Supabase dashboard):
--
--      UPDATE profiles
--      SET    role = 'SUPER_ADMIN'
--      WHERE  id = 'YOUR-USER-UUID';
--
-- 2. VERIFY THE SETUP
--    You can verify all policies are in place by running:
--
--      SELECT schemaname, tablename, policyname, permissive, roles, qual
--      FROM pg_policies
--      WHERE schemaname = 'public'
--      ORDER BY tablename, policyname;
--
-- 3. TEST THE SECURITY
--    • Create a test company
--    • Create test users in different companies
--    • Verify users can only see their own company's data
--    • Verify super admins can see all data
--
-- ────────────────────────────────────────────────────────────────
-- ARCHITECTURE NOTES
-- ────────────────────────────────────────────────────────────────
--
-- Multi-Tenancy Model:
-- • Every tenant data table has a company_id foreign key
-- • RLS policies enforce company_id = current_user's company_id
-- • Super admins bypass tenant isolation (cross-company access)
--
-- Security-Definer Functions:
-- • Avoid RLS recursion issues
-- • Provide consistent, efficient lookups
-- • Cache-friendly (STABLE marking)
--
-- Onboarding Flow:
-- • New users can create companies (allow_company_insert)
-- • Users can update their own profile even without company_id
-- • Invite tokens allow secure team member onboarding
--
-- Performance:
-- • Indexes on all company_id columns
-- • Indexes on frequently queried foreign keys
-- • Security-definer functions are STABLE for query planning
--
-- ================================================================
