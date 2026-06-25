-- =============================================================================
-- Migration: Fix cross-company leak in time-tracking admin RLS policies
--
-- The admin policies on time_entries, time_clock_crews, and
-- inbound_ticket_time_entries were written as:
--
--     (p.role = 'SUPER_ADMIN' OR p.company_id = company_id)
--
-- The intent was "an ADMIN may only reach rows in their OWN company". But
-- because BOTH `profiles` and the target table expose a `company_id` column,
-- Postgres resolved the unqualified `company_id` to the inner subquery's
-- `profiles.company_id` (p.company_id) -- turning the predicate into
-- `p.company_id = p.company_id`, which is ALWAYS TRUE. The effect: any ADMIN
-- (not just SUPER_ADMIN) could read/manage EVERY company's time entries and
-- crews -- e.g. seeing another company's clock-in info.
--
-- Fix: qualify the comparison with the TARGET TABLE's company_id column so the
-- ADMIN branch is correctly scoped to the admin's own company.
-- =============================================================================

-- ── time_entries: admins manage their own company's entries; SUPER_ADMIN spans all
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

-- ── time_clock_crews: admins manage their own company's crews; SUPER_ADMIN spans all
DROP POLICY IF EXISTS "time_clock_crews_admin_manage" ON time_clock_crews;
CREATE POLICY "time_clock_crews_admin_manage" ON time_clock_crews
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('ADMIN', 'SUPER_ADMIN')
        AND (p.role = 'SUPER_ADMIN' OR p.company_id = time_clock_crews.company_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('ADMIN', 'SUPER_ADMIN')
        AND (p.role = 'SUPER_ADMIN' OR p.company_id = time_clock_crews.company_id)
    )
  );

-- ── inbound_ticket_time_entries: admins clock out only their own company's techs
DROP POLICY IF EXISTS "admin_update_time_entries" ON inbound_ticket_time_entries;
CREATE POLICY "admin_update_time_entries" ON inbound_ticket_time_entries
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('ADMIN', 'SUPER_ADMIN')
        AND (p.role = 'SUPER_ADMIN' OR p.company_id = inbound_ticket_time_entries.company_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('ADMIN', 'SUPER_ADMIN')
        AND (p.role = 'SUPER_ADMIN' OR p.company_id = inbound_ticket_time_entries.company_id)
    )
  );
