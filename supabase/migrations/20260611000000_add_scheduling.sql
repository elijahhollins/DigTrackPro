-- =============================================================================
-- Migration: Add "Scheduling & Field Ops" module (ported from service-track-pro)
--
-- This migration is PURELY ADDITIVE. It creates new tables only and adds a
-- single nullable/defaulted feature-flag column to the existing `companies`
-- table. No existing table is altered in a breaking way, so the live app is
-- unaffected until a company has `scheduling_enabled = true`.
--
-- RLS reuses DigTrackPro's existing security-definer helpers:
--   get_user_company_id()  -> uuid  (from profiles)
--   is_super_admin()       -> bool  (from profiles)
--
-- Note on `service_jobs`: DigTrackPro already owns a `jobs` table (uuid id).
-- The field-ops/billing job entity from service-track-pro is a different,
-- richer concept (customer, work logs, invoices, integer id), so it lives in
-- its own `service_jobs` table to avoid colliding with — or mutating — the
-- existing `jobs` table.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. FEATURE FLAG
-- ---------------------------------------------------------------------------
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS scheduling_enabled boolean NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- 1. EMPLOYEES (labor / costing records — distinct from auth profiles)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS employees (
  id          BIGSERIAL PRIMARY KEY,
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        TEXT NOT NULL DEFAULT '',
  role        TEXT NOT NULL DEFAULT '',
  hourly_rate NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "employees_select" ON employees;
CREATE POLICY "employees_select" ON employees FOR SELECT USING (company_id = get_user_company_id());
DROP POLICY IF EXISTS "employees_insert" ON employees;
CREATE POLICY "employees_insert" ON employees FOR INSERT WITH CHECK (company_id = get_user_company_id());
DROP POLICY IF EXISTS "employees_update" ON employees;
CREATE POLICY "employees_update" ON employees FOR UPDATE USING (company_id = get_user_company_id());
DROP POLICY IF EXISTS "employees_delete" ON employees;
CREATE POLICY "employees_delete" ON employees FOR DELETE USING (company_id = get_user_company_id());
CREATE INDEX IF NOT EXISTS employees_company_idx ON employees (company_id);

-- ---------------------------------------------------------------------------
-- 2. EQUIPMENT
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS equipment (
  id          BIGSERIAL PRIMARY KEY,
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        TEXT NOT NULL DEFAULT '',
  hourly_rate NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE equipment ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "equipment_select" ON equipment;
CREATE POLICY "equipment_select" ON equipment FOR SELECT USING (company_id = get_user_company_id());
DROP POLICY IF EXISTS "equipment_insert" ON equipment;
CREATE POLICY "equipment_insert" ON equipment FOR INSERT WITH CHECK (company_id = get_user_company_id());
DROP POLICY IF EXISTS "equipment_update" ON equipment;
CREATE POLICY "equipment_update" ON equipment FOR UPDATE USING (company_id = get_user_company_id());
DROP POLICY IF EXISTS "equipment_delete" ON equipment;
CREATE POLICY "equipment_delete" ON equipment FOR DELETE USING (company_id = get_user_company_id());
CREATE INDEX IF NOT EXISTS equipment_company_idx ON equipment (company_id);

-- ---------------------------------------------------------------------------
-- 3. MATERIALS (unit_price nullable -> supports ad-hoc "unlisted" materials)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS materials (
  id         BIGSERIAL PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name       TEXT NOT NULL DEFAULT '',
  unit_price NUMERIC(10,2) DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE materials ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "materials_select" ON materials;
CREATE POLICY "materials_select" ON materials FOR SELECT USING (company_id = get_user_company_id());
DROP POLICY IF EXISTS "materials_insert" ON materials;
CREATE POLICY "materials_insert" ON materials FOR INSERT WITH CHECK (company_id = get_user_company_id());
DROP POLICY IF EXISTS "materials_update" ON materials;
CREATE POLICY "materials_update" ON materials FOR UPDATE USING (company_id = get_user_company_id());
DROP POLICY IF EXISTS "materials_delete" ON materials;
CREATE POLICY "materials_delete" ON materials FOR DELETE USING (company_id = get_user_company_id());
CREATE INDEX IF NOT EXISTS materials_company_idx ON materials (company_id);

-- ---------------------------------------------------------------------------
-- 4. SERVICE JOBS (billing/work-log job entity — separate from public.jobs)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS service_jobs (
  id            BIGSERIAL PRIMARY KEY,
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_name TEXT NOT NULL DEFAULT '',
  job_name      TEXT NOT NULL DEFAULT '',
  job_number    TEXT NOT NULL DEFAULT '',
  address       TEXT NOT NULL DEFAULT '',
  start_date    DATE,
  end_date      DATE,
  notes         TEXT NOT NULL DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed')),
  foreman_id    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE service_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_jobs_select" ON service_jobs;
CREATE POLICY "service_jobs_select" ON service_jobs FOR SELECT USING (company_id = get_user_company_id());
DROP POLICY IF EXISTS "service_jobs_insert" ON service_jobs;
CREATE POLICY "service_jobs_insert" ON service_jobs FOR INSERT WITH CHECK (company_id = get_user_company_id());
DROP POLICY IF EXISTS "service_jobs_update" ON service_jobs;
CREATE POLICY "service_jobs_update" ON service_jobs FOR UPDATE USING (company_id = get_user_company_id());
DROP POLICY IF EXISTS "service_jobs_delete" ON service_jobs;
CREATE POLICY "service_jobs_delete" ON service_jobs FOR DELETE USING (company_id = get_user_company_id());
CREATE INDEX IF NOT EXISTS service_jobs_company_idx ON service_jobs (company_id);

-- ---------------------------------------------------------------------------
-- 5. WORK LOGS (daily labor/equipment/material entries per service job)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS work_logs (
  id         BIGSERIAL PRIMARY KEY,
  job_id     BIGINT NOT NULL REFERENCES service_jobs(id) ON DELETE CASCADE,
  date       DATE NOT NULL,
  notes      TEXT NOT NULL DEFAULT '',
  data       JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE work_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "work_logs_select" ON work_logs;
CREATE POLICY "work_logs_select" ON work_logs FOR SELECT USING (
  EXISTS (SELECT 1 FROM service_jobs j WHERE j.id = job_id AND j.company_id = get_user_company_id()));
DROP POLICY IF EXISTS "work_logs_insert" ON work_logs;
CREATE POLICY "work_logs_insert" ON work_logs FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM service_jobs j WHERE j.id = job_id AND j.company_id = get_user_company_id()));
DROP POLICY IF EXISTS "work_logs_update" ON work_logs;
CREATE POLICY "work_logs_update" ON work_logs FOR UPDATE USING (
  EXISTS (SELECT 1 FROM service_jobs j WHERE j.id = job_id AND j.company_id = get_user_company_id()));
DROP POLICY IF EXISTS "work_logs_delete" ON work_logs;
CREATE POLICY "work_logs_delete" ON work_logs FOR DELETE USING (
  EXISTS (SELECT 1 FROM service_jobs j WHERE j.id = job_id AND j.company_id = get_user_company_id()));
CREATE INDEX IF NOT EXISTS work_logs_job_idx ON work_logs (job_id);

-- ---------------------------------------------------------------------------
-- 6. WORK LOG TEMPLATES
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS work_log_templates (
  id         BIGSERIAL PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name       TEXT NOT NULL DEFAULT '',
  data       JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE work_log_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "work_log_templates_select" ON work_log_templates;
CREATE POLICY "work_log_templates_select" ON work_log_templates FOR SELECT USING (company_id = get_user_company_id());
DROP POLICY IF EXISTS "work_log_templates_insert" ON work_log_templates;
CREATE POLICY "work_log_templates_insert" ON work_log_templates FOR INSERT WITH CHECK (company_id = get_user_company_id());
DROP POLICY IF EXISTS "work_log_templates_update" ON work_log_templates;
CREATE POLICY "work_log_templates_update" ON work_log_templates FOR UPDATE USING (company_id = get_user_company_id());
DROP POLICY IF EXISTS "work_log_templates_delete" ON work_log_templates;
CREATE POLICY "work_log_templates_delete" ON work_log_templates FOR DELETE USING (company_id = get_user_company_id());

-- ---------------------------------------------------------------------------
-- 7. INVOICES
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoices (
  id              BIGSERIAL PRIMARY KEY,
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  job_id          BIGINT NOT NULL REFERENCES service_jobs(id) ON DELETE CASCADE,
  invoice_number  TEXT NOT NULL DEFAULT '',
  date            TIMESTAMPTZ,
  due_date        TIMESTAMPTZ,
  status          TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','paid')),
  labor_total     NUMERIC(12,2) NOT NULL DEFAULT 0,
  equipment_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  material_total  NUMERIC(12,2) NOT NULL DEFAULT 0,
  grand_total     NUMERIC(12,2) NOT NULL DEFAULT 0,
  data            JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "invoices_select" ON invoices;
CREATE POLICY "invoices_select" ON invoices FOR SELECT USING (company_id = get_user_company_id());
DROP POLICY IF EXISTS "invoices_insert" ON invoices;
CREATE POLICY "invoices_insert" ON invoices FOR INSERT WITH CHECK (company_id = get_user_company_id());
DROP POLICY IF EXISTS "invoices_update" ON invoices;
CREATE POLICY "invoices_update" ON invoices FOR UPDATE USING (company_id = get_user_company_id());
DROP POLICY IF EXISTS "invoices_delete" ON invoices;
CREATE POLICY "invoices_delete" ON invoices FOR DELETE USING (company_id = get_user_company_id());
CREATE INDEX IF NOT EXISTS invoices_company_idx ON invoices (company_id);
CREATE INDEX IF NOT EXISTS invoices_job_idx ON invoices (job_id);

-- ---------------------------------------------------------------------------
-- 8. INVOICE SETTINGS (one row per company)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS invoice_settings (
  id              BIGSERIAL PRIMARY KEY,
  company_id      UUID NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
  company_name    TEXT NOT NULL DEFAULT '',
  company_address TEXT NOT NULL DEFAULT '',
  company_phone   TEXT NOT NULL DEFAULT '',
  company_email   TEXT NOT NULL DEFAULT '',
  logo_initials   TEXT NOT NULL DEFAULT '',
  payment_terms   TEXT NOT NULL DEFAULT 'Payment due within 30 days.',
  header_color    TEXT NOT NULL DEFAULT '#0a142d',
  accent_color    TEXT NOT NULL DEFAULT '#c49614',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE invoice_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "invoice_settings_select" ON invoice_settings;
CREATE POLICY "invoice_settings_select" ON invoice_settings FOR SELECT USING (company_id = get_user_company_id());
DROP POLICY IF EXISTS "invoice_settings_insert" ON invoice_settings;
CREATE POLICY "invoice_settings_insert" ON invoice_settings FOR INSERT WITH CHECK (company_id = get_user_company_id());
DROP POLICY IF EXISTS "invoice_settings_update" ON invoice_settings;
CREATE POLICY "invoice_settings_update" ON invoice_settings FOR UPDATE USING (company_id = get_user_company_id());

-- ---------------------------------------------------------------------------
-- 9. SCHEDULE CREWS (id is a client-generated UUID string)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schedule_crews (
  id         TEXT PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name       TEXT NOT NULL DEFAULT '',
  member_ids BIGINT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE schedule_crews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "schedule_crews_select" ON schedule_crews;
CREATE POLICY "schedule_crews_select" ON schedule_crews FOR SELECT USING (company_id = get_user_company_id());
DROP POLICY IF EXISTS "schedule_crews_insert" ON schedule_crews;
CREATE POLICY "schedule_crews_insert" ON schedule_crews FOR INSERT WITH CHECK (company_id = get_user_company_id());
DROP POLICY IF EXISTS "schedule_crews_update" ON schedule_crews;
CREATE POLICY "schedule_crews_update" ON schedule_crews FOR UPDATE USING (company_id = get_user_company_id());
DROP POLICY IF EXISTS "schedule_crews_delete" ON schedule_crews;
CREATE POLICY "schedule_crews_delete" ON schedule_crews FOR DELETE USING (company_id = get_user_company_id());
CREATE INDEX IF NOT EXISTS schedule_crews_company_idx ON schedule_crews (company_id);

-- ---------------------------------------------------------------------------
-- 10. SCHEDULE JOB OPTIONS (board's own job list; hybrid-seeded from jobs UI-side)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schedule_job_options (
  id             BIGSERIAL PRIMARY KEY,
  company_id     UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  job_number     TEXT NOT NULL,
  location       TEXT NOT NULL DEFAULT '',
  estimated_days INT  NOT NULL DEFAULT 1 CHECK (estimated_days >= 1),
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (company_id, job_number)
);
ALTER TABLE schedule_job_options ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "schedule_job_options_select" ON schedule_job_options;
CREATE POLICY "schedule_job_options_select" ON schedule_job_options FOR SELECT USING (company_id = get_user_company_id());
DROP POLICY IF EXISTS "schedule_job_options_insert" ON schedule_job_options;
CREATE POLICY "schedule_job_options_insert" ON schedule_job_options FOR INSERT WITH CHECK (company_id = get_user_company_id());
DROP POLICY IF EXISTS "schedule_job_options_update" ON schedule_job_options;
CREATE POLICY "schedule_job_options_update" ON schedule_job_options FOR UPDATE USING (company_id = get_user_company_id());
DROP POLICY IF EXISTS "schedule_job_options_delete" ON schedule_job_options;
CREATE POLICY "schedule_job_options_delete" ON schedule_job_options FOR DELETE USING (company_id = get_user_company_id());
CREATE INDEX IF NOT EXISTS schedule_job_options_company_idx ON schedule_job_options (company_id);

-- ---------------------------------------------------------------------------
-- 11. SCHEDULE BLOCKS (id is a client-generated UUID string)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS schedule_blocks (
  id            TEXT PRIMARY KEY,
  company_id    UUID    NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  crew_id       TEXT    NOT NULL REFERENCES schedule_crews(id) ON DELETE CASCADE,
  job_number    TEXT    NOT NULL,
  start_date    DATE    NOT NULL,
  duration_days INT     NOT NULL DEFAULT 1 CHECK (duration_days >= 1),
  type          TEXT    NOT NULL DEFAULT 'job' CHECK (type IN ('job','delay')),
  extended      BOOLEAN NOT NULL DEFAULT FALSE,
  equipment_ids BIGINT[] NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE schedule_blocks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "schedule_blocks_select" ON schedule_blocks;
CREATE POLICY "schedule_blocks_select" ON schedule_blocks FOR SELECT USING (company_id = get_user_company_id());
DROP POLICY IF EXISTS "schedule_blocks_insert" ON schedule_blocks;
CREATE POLICY "schedule_blocks_insert" ON schedule_blocks FOR INSERT WITH CHECK (company_id = get_user_company_id());
DROP POLICY IF EXISTS "schedule_blocks_update" ON schedule_blocks;
CREATE POLICY "schedule_blocks_update" ON schedule_blocks FOR UPDATE USING (company_id = get_user_company_id());
DROP POLICY IF EXISTS "schedule_blocks_delete" ON schedule_blocks;
CREATE POLICY "schedule_blocks_delete" ON schedule_blocks FOR DELETE USING (company_id = get_user_company_id());
CREATE INDEX IF NOT EXISTS schedule_blocks_company_idx ON schedule_blocks (company_id);
CREATE INDEX IF NOT EXISTS schedule_blocks_crew_idx    ON schedule_blocks (crew_id);
CREATE INDEX IF NOT EXISTS schedule_blocks_date_idx    ON schedule_blocks (start_date);

-- ---------------------------------------------------------------------------
-- 12. GRANTS
-- ---------------------------------------------------------------------------
GRANT ALL ON employees, equipment, materials, service_jobs, work_logs,
  work_log_templates, invoices, invoice_settings, schedule_crews,
  schedule_job_options, schedule_blocks TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
