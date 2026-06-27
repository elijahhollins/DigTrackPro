-- =============================================================================
-- Migration: Daily report finalize / lock
--
-- A foreman drafts and then SUBMITS (finalizes) a daily report. Once submitted,
-- the foreman can no longer edit it — only a company admin can. This is enforced
-- both in the UI and here at the row level so it can't be bypassed by the client.
--
-- Forward-only ALTER (the table is created in 20260626000000_add_daily_reports).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. STATUS + SUBMITTED-AT
-- ---------------------------------------------------------------------------
ALTER TABLE public.daily_reports
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft';
ALTER TABLE public.daily_reports
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'daily_reports_status_check') THEN
    ALTER TABLE public.daily_reports
      ADD CONSTRAINT daily_reports_status_check CHECK (status IN ('draft', 'submitted'));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. RLS: admins edit anything in their company; everyone else (foremen on a
--    CREW login) may edit ONLY their own report while it is still a draft.
--    SELECT/INSERT stay company-scoped (inherited from the create migration;
--    re-declared here so this file is self-contained / re-runnable).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "daily_reports_select" ON daily_reports;
CREATE POLICY "daily_reports_select" ON daily_reports
  FOR SELECT USING (company_id = get_user_company_id());

DROP POLICY IF EXISTS "daily_reports_insert" ON daily_reports;
CREATE POLICY "daily_reports_insert" ON daily_reports
  FOR INSERT WITH CHECK (company_id = get_user_company_id());

DROP POLICY IF EXISTS "daily_reports_update" ON daily_reports;
CREATE POLICY "daily_reports_update" ON daily_reports
  FOR UPDATE
  USING (
    company_id = get_user_company_id()
    AND (
      EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('ADMIN', 'SUPER_ADMIN'))
      OR (prepared_by_id = auth.uid() AND status = 'draft')
    )
  )
  WITH CHECK (company_id = get_user_company_id());

DROP POLICY IF EXISTS "daily_reports_delete" ON daily_reports;
CREATE POLICY "daily_reports_delete" ON daily_reports
  FOR DELETE
  USING (
    company_id = get_user_company_id()
    AND (
      EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('ADMIN', 'SUPER_ADMIN'))
      OR (prepared_by_id = auth.uid() AND status = 'draft')
    )
  );
