-- =============================================================================
-- Migration: Keep daily-report drafts private until submitted
--
-- A draft is only visible to the foreman who authored it. Once submitted it
-- becomes visible to the rest of the company (admins included). This means an
-- admin never sees another user's in-progress draft — only finalized reports.
--
-- Forward-only: replaces the SELECT policy from the create migration.
-- =============================================================================

DROP POLICY IF EXISTS "daily_reports_select" ON daily_reports;
CREATE POLICY "daily_reports_select" ON daily_reports
  FOR SELECT USING (
    company_id = get_user_company_id()
    AND (status = 'submitted' OR prepared_by_id = auth.uid())
  );
