-- =============================================================================
-- Migration: Add "Daily Reports" to the Time Tracker module
--
-- A foreman fills out an end-of-day report for a job: a progress summary, photos,
-- safety notes, JULIE locate/refresh needs, and an injuries count. Crew hours,
-- the time-entry log, and the cost-code breakdown are pulled live from
-- `time_entries` at render time, so they are NOT duplicated here.
--
-- PURELY ADDITIVE: one new table. RLS is company-scoped (mirrors `cost_codes`)
-- rather than admin-only, because foremen — whose logins are CREW role — must be
-- able to create and edit their own reports.
--
-- Polymorphic job reference matches `time_entries`: job_kind ('dig'|'service')
-- plus job_ref (the id as text) plus a denormalized job_label for reporting.
-- =============================================================================

CREATE TABLE IF NOT EXISTS daily_reports (
  id               BIGSERIAL PRIMARY KEY,
  company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  job_kind         TEXT NOT NULL CHECK (job_kind IN ('dig','service')),
  job_ref          TEXT NOT NULL,
  job_label        TEXT NOT NULL DEFAULT '',
  report_date      DATE NOT NULL,
  progress_summary TEXT NOT NULL DEFAULT '',
  safety_notes     TEXT NOT NULL DEFAULT '',
  locates_notes    TEXT NOT NULL DEFAULT '',   -- JULIE locates or refreshes needed
  injuries_count   INTEGER NOT NULL DEFAULT 0,
  -- photos: JSON array of { url, caption }. Files live in the existing
  -- `job-photos` storage bucket under a daily-reports/ prefix.
  photos           JSONB NOT NULL DEFAULT '[]'::jsonb,
  prepared_by_id   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  prepared_by_name TEXT NOT NULL DEFAULT '',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE daily_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "daily_reports_select" ON daily_reports;
CREATE POLICY "daily_reports_select" ON daily_reports
  FOR SELECT USING (company_id = get_user_company_id());
DROP POLICY IF EXISTS "daily_reports_insert" ON daily_reports;
CREATE POLICY "daily_reports_insert" ON daily_reports
  FOR INSERT WITH CHECK (company_id = get_user_company_id());
DROP POLICY IF EXISTS "daily_reports_update" ON daily_reports;
CREATE POLICY "daily_reports_update" ON daily_reports
  FOR UPDATE USING (company_id = get_user_company_id());
DROP POLICY IF EXISTS "daily_reports_delete" ON daily_reports;
CREATE POLICY "daily_reports_delete" ON daily_reports
  FOR DELETE USING (company_id = get_user_company_id());

CREATE INDEX IF NOT EXISTS daily_reports_company_idx ON daily_reports (company_id);
CREATE INDEX IF NOT EXISTS daily_reports_job_idx ON daily_reports (company_id, job_kind, job_ref);
CREATE INDEX IF NOT EXISTS daily_reports_date_idx ON daily_reports (company_id, report_date);
