-- ─────────────────────────────────────────────────────────────────────────────
-- Patch: add admin UPDATE policy for inbound_ticket_time_entries
-- Run this if you already ran add_inbound_time_entries.sql but admins cannot
-- clock out technicians from the Live Activity panel.
-- ─────────────────────────────────────────────────────────────────────────────

-- Admins (ADMIN / SUPER_ADMIN) can update (clock out) entries for their company.
-- SUPER_ADMINs can update entries for any company.
CREATE POLICY "admin_update_time_entries" ON inbound_ticket_time_entries
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role = 'SUPER_ADMIN'
    )
    OR (
      company_id = (
        SELECT company_id FROM profiles WHERE id = auth.uid()
      )
      AND EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
          AND role IN ('ADMIN', 'SUPER_ADMIN')
      )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role = 'SUPER_ADMIN'
    )
    OR (
      company_id = (
        SELECT company_id FROM profiles WHERE id = auth.uid()
      )
      AND EXISTS (
        SELECT 1 FROM profiles
        WHERE id = auth.uid()
          AND role IN ('ADMIN', 'SUPER_ADMIN')
      )
    )
  );
