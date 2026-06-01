-- ─────────────────────────────────────────────────────────────────────────────
-- Patch: add admin UPDATE policy for inbound_ticket_time_entries
-- Run this if you already ran add_inbound_time_entries.sql but admins cannot
-- clock out technicians from the Live Activity panel.
-- ─────────────────────────────────────────────────────────────────────────────

-- Admins (ADMIN / SUPER_ADMIN) can update (clock out) entries for their company.
-- SUPER_ADMINs can update entries for any company.
-- Single profiles lookup per check: role = SUPER_ADMIN grants access to all companies;
-- ADMIN role is restricted to matching company_id.
CREATE POLICY "admin_update_time_entries" ON inbound_ticket_time_entries
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('ADMIN', 'SUPER_ADMIN')
        AND (p.role = 'SUPER_ADMIN' OR p.company_id = company_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('ADMIN', 'SUPER_ADMIN')
        AND (p.role = 'SUPER_ADMIN' OR p.company_id = company_id)
    )
  );
