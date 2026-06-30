-- =============================================================================
-- Migration: Job Hub invoicing + retire scheduler equipment/job-options
--
-- Part A — invoicing moves from the scheduling board into the Job Hub, so the
-- equipment-assignment and ad-hoc "job options" features that were bolted onto
-- the scheduling board are abandoned. Drop their now-unused storage.
--
-- Part B — add `job_invoices`, keyed to the dig-ticket `jobs` table (uuid id).
-- This is intentionally a separate table from the service-job `invoices` table
-- (which is keyed to `service_jobs`, a bigint id) created in
-- 20260611000000_add_scheduling.sql. RLS reuses get_user_company_id().
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Part A. Retire scheduler equipment + job-options storage
-- ---------------------------------------------------------------------------
ALTER TABLE IF EXISTS schedule_blocks DROP COLUMN IF EXISTS equipment_ids;
DROP TABLE IF EXISTS schedule_job_options;

-- ---------------------------------------------------------------------------
-- Part B. JOB INVOICES (keyed to dig-ticket jobs.id, uuid)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS job_invoices (
  id              BIGSERIAL PRIMARY KEY,
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  job_id          UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  invoice_number  TEXT NOT NULL DEFAULT '',
  date            TIMESTAMPTZ,
  due_date        TIMESTAMPTZ,
  labor_total     NUMERIC(12,2) NOT NULL DEFAULT 0,
  equipment_total NUMERIC(12,2) NOT NULL DEFAULT 0,
  material_total  NUMERIC(12,2) NOT NULL DEFAULT 0,
  grand_total     NUMERIC(12,2) NOT NULL DEFAULT 0,
  -- { customerName, address, employees[], equipment[], materials[] }
  data            JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE job_invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "job_invoices_select" ON job_invoices;
CREATE POLICY "job_invoices_select" ON job_invoices FOR SELECT USING (company_id = get_user_company_id());
DROP POLICY IF EXISTS "job_invoices_insert" ON job_invoices;
CREATE POLICY "job_invoices_insert" ON job_invoices FOR INSERT WITH CHECK (company_id = get_user_company_id());
DROP POLICY IF EXISTS "job_invoices_update" ON job_invoices;
CREATE POLICY "job_invoices_update" ON job_invoices FOR UPDATE USING (company_id = get_user_company_id());
DROP POLICY IF EXISTS "job_invoices_delete" ON job_invoices;
CREATE POLICY "job_invoices_delete" ON job_invoices FOR DELETE USING (company_id = get_user_company_id());
CREATE INDEX IF NOT EXISTS job_invoices_company_idx ON job_invoices (company_id);
CREATE INDEX IF NOT EXISTS job_invoices_job_idx ON job_invoices (job_id);
