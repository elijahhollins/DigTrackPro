-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: add inbound_ticket_time_entries
-- Run in Supabase Dashboard → SQL Editor
-- Tracks the time each technician spends clocked in to a locate request.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inbound_ticket_time_entries (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id        uuid        NOT NULL REFERENCES inbound_tickets(id) ON DELETE CASCADE,
  company_id       uuid        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  technician_id    uuid        NOT NULL REFERENCES profiles(id),
  technician_name  text        NOT NULL DEFAULT '',
  clocked_in_at    timestamptz NOT NULL DEFAULT now(),
  clocked_out_at   timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Index for fast per-ticket, per-company, and per-tech look-ups
CREATE INDEX IF NOT EXISTS idx_time_entries_ticket_id    ON inbound_ticket_time_entries (ticket_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_company_id   ON inbound_ticket_time_entries (company_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_technician   ON inbound_ticket_time_entries (technician_id);

-- Row-Level Security: crew see only their own entries; admins see all company entries
ALTER TABLE inbound_ticket_time_entries ENABLE ROW LEVEL SECURITY;

-- Admins (ADMIN / SUPER_ADMIN) can read all entries for their own company
CREATE POLICY "admin_read_time_entries" ON inbound_ticket_time_entries
  FOR SELECT TO authenticated
  USING (
    company_id = (
      SELECT company_id FROM profiles WHERE id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid()
        AND role IN ('ADMIN', 'SUPER_ADMIN')
    )
  );

-- Technicians can read/insert/update their own entries
CREATE POLICY "crew_manage_own_time_entries" ON inbound_ticket_time_entries
  FOR ALL TO authenticated
  USING  (technician_id = auth.uid())
  WITH CHECK (technician_id = auth.uid());
