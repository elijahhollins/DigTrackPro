-- =============================================================================
-- Migration: Add "Time Tracker" module
--
-- Employees clock in/out against a specific job + cost code (cost codes are
-- task categories for time-allocation reporting). This migration is PURELY
-- ADDITIVE: it creates new tables, adds a nullable link column to `employees`,
-- and adds a single defaulted feature-flag column to `companies`. No existing
-- table is altered in a breaking way, so the live app is unaffected until a
-- company has `time_tracking_enabled = true`.
--
-- RLS reuses DigTrackPro's existing security-definer helper:
--   get_user_company_id() -> uuid  (from profiles)
-- and mirrors the admin/crew split already used by inbound_ticket_time_entries.
--
-- Polymorphic job reference: a time entry (and a per-job cost-code assignment)
-- can point at EITHER a dig job (public.jobs, uuid id) OR a service job
-- (public.service_jobs, bigint id). We store job_kind ('dig'|'service') plus
-- job_ref (the id as text) plus a denormalized job_label for reporting.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. FEATURE FLAG
-- ---------------------------------------------------------------------------
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS time_tracking_enabled boolean NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- 1. EMPLOYEE -> LOGIN LINK (optional). A linked employee can self-clock.
-- ---------------------------------------------------------------------------
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL;

-- One profile maps to at most one employee within a company.
CREATE UNIQUE INDEX IF NOT EXISTS employees_profile_unique
  ON employees (company_id, profile_id) WHERE profile_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. COST CODES (global master list per company; admin-managed)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cost_codes (
  id          BIGSERIAL PRIMARY KEY,
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  code        TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE cost_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cost_codes_select" ON cost_codes;
CREATE POLICY "cost_codes_select" ON cost_codes FOR SELECT USING (company_id = get_user_company_id());
DROP POLICY IF EXISTS "cost_codes_insert" ON cost_codes;
CREATE POLICY "cost_codes_insert" ON cost_codes FOR INSERT WITH CHECK (company_id = get_user_company_id());
DROP POLICY IF EXISTS "cost_codes_update" ON cost_codes;
CREATE POLICY "cost_codes_update" ON cost_codes FOR UPDATE USING (company_id = get_user_company_id());
DROP POLICY IF EXISTS "cost_codes_delete" ON cost_codes;
CREATE POLICY "cost_codes_delete" ON cost_codes FOR DELETE USING (company_id = get_user_company_id());
CREATE INDEX IF NOT EXISTS cost_codes_company_idx ON cost_codes (company_id);

-- ---------------------------------------------------------------------------
-- 3. JOB <-> COST CODE ASSIGNMENTS (which codes apply to which job)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS job_cost_codes (
  id           BIGSERIAL PRIMARY KEY,
  company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  job_kind     TEXT NOT NULL CHECK (job_kind IN ('dig','service')),
  job_ref      TEXT NOT NULL,
  cost_code_id BIGINT NOT NULL REFERENCES cost_codes(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (company_id, job_kind, job_ref, cost_code_id)
);
ALTER TABLE job_cost_codes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "job_cost_codes_select" ON job_cost_codes;
CREATE POLICY "job_cost_codes_select" ON job_cost_codes FOR SELECT USING (company_id = get_user_company_id());
DROP POLICY IF EXISTS "job_cost_codes_insert" ON job_cost_codes;
CREATE POLICY "job_cost_codes_insert" ON job_cost_codes FOR INSERT WITH CHECK (company_id = get_user_company_id());
DROP POLICY IF EXISTS "job_cost_codes_update" ON job_cost_codes;
CREATE POLICY "job_cost_codes_update" ON job_cost_codes FOR UPDATE USING (company_id = get_user_company_id());
DROP POLICY IF EXISTS "job_cost_codes_delete" ON job_cost_codes;
CREATE POLICY "job_cost_codes_delete" ON job_cost_codes FOR DELETE USING (company_id = get_user_company_id());
CREATE INDEX IF NOT EXISTS job_cost_codes_company_idx ON job_cost_codes (company_id);
CREATE INDEX IF NOT EXISTS job_cost_codes_job_idx ON job_cost_codes (company_id, job_kind, job_ref);

-- ---------------------------------------------------------------------------
-- 4. TIME ENTRIES (one open entry per employee at a time)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS time_entries (
  id             BIGSERIAL PRIMARY KEY,
  company_id     UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id    BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  job_kind       TEXT NOT NULL CHECK (job_kind IN ('dig','service')),
  job_ref        TEXT NOT NULL,
  job_label      TEXT NOT NULL DEFAULT '',
  cost_code_id   BIGINT REFERENCES cost_codes(id) ON DELETE SET NULL,
  clocked_in_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  clocked_out_at TIMESTAMPTZ,
  note           TEXT NOT NULL DEFAULT '',
  gps_lat        DOUBLE PRECISION,
  gps_lng        DOUBLE PRECISION,
  approved       BOOLEAN NOT NULL DEFAULT FALSE,
  approved_by    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  approved_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE time_entries ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS time_entries_company_idx  ON time_entries (company_id);
CREATE INDEX IF NOT EXISTS time_entries_employee_idx ON time_entries (employee_id);
-- Fast "is this employee currently on the clock?" lookup; enforce single-open in app logic.
CREATE INDEX IF NOT EXISTS time_entries_open_idx ON time_entries (employee_id) WHERE clocked_out_at IS NULL;

-- Admins (ADMIN / SUPER_ADMIN) manage all entries for their company.
-- SUPER_ADMINs manage entries for any company. Covers foreman crew clock-in,
-- manual edits, and approval. (Mirrors inbound admin_*_time_entries policies.)
DROP POLICY IF EXISTS "time_entries_admin_all" ON time_entries;
CREATE POLICY "time_entries_admin_all" ON time_entries
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('ADMIN', 'SUPER_ADMIN')
        AND (p.role = 'SUPER_ADMIN' OR p.company_id = time_entries.company_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('ADMIN', 'SUPER_ADMIN')
        AND (p.role = 'SUPER_ADMIN' OR p.company_id = time_entries.company_id)
    )
  );

-- Self-clockers: an employee linked to the authenticated user (employees.profile_id
-- = auth.uid()) may read/insert/update only their own entries.
DROP POLICY IF EXISTS "time_entries_self_manage" ON time_entries;
CREATE POLICY "time_entries_self_manage" ON time_entries
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM employees e
      WHERE e.id = time_entries.employee_id
        AND e.profile_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM employees e
      WHERE e.id = time_entries.employee_id
        AND e.profile_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 5. GRANTS
-- ---------------------------------------------------------------------------
GRANT ALL ON cost_codes, job_cost_codes, time_entries TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
