-- Migration: Add Inbound Tickets module tables
-- These are entirely new tables and do not alter any existing tables.

-- 1. inbound_tickets — represents utility locate requests requiring field tech on-site
CREATE TABLE IF NOT EXISTS inbound_tickets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamp with time zone DEFAULT now(),
  company_id      uuid REFERENCES companies(id) NOT NULL,
  ticket_number   text NOT NULL DEFAULT '',
  site_address    text NOT NULL DEFAULT '',
  dig_start_date  text DEFAULT '',
  due_date        text NOT NULL DEFAULT '',
  status          text NOT NULL DEFAULT 'unassigned'
                    CHECK (status IN ('unassigned','assigned','in_progress','completed')),
  assigned_to     uuid REFERENCES profiles(id),
  caller_name     text DEFAULT '',
  caller_phone    text DEFAULT '',
  utility_types   text[] DEFAULT '{}',
  notes           text DEFAULT '',
  created_by      uuid REFERENCES profiles(id) NOT NULL
);

-- 2. inbound_ticket_photos — images stored in Supabase Storage
CREATE TABLE IF NOT EXISTS inbound_ticket_photos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id     uuid REFERENCES inbound_tickets(id) ON DELETE CASCADE NOT NULL,
  storage_path  text NOT NULL,
  uploaded_by   uuid REFERENCES profiles(id),
  uploaded_at   timestamp with time zone DEFAULT now()
);

-- 3. inbound_ticket_notes — append-only timestamped note log per ticket
CREATE TABLE IF NOT EXISTS inbound_ticket_notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   uuid REFERENCES inbound_tickets(id) ON DELETE CASCADE NOT NULL,
  text        text NOT NULL,
  author_id   uuid REFERENCES profiles(id),
  author_name text NOT NULL DEFAULT '',
  created_at  timestamp with time zone DEFAULT now()
);

-- 4. Enable row-level security
ALTER TABLE inbound_tickets      ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbound_ticket_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbound_ticket_notes ENABLE ROW LEVEL SECURITY;

-- 5. Tenant-isolation policies
CREATE POLICY "tenant_isolation_inbound_tickets" ON inbound_tickets
  FOR ALL TO authenticated
  USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  )
  WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "tenant_isolation_inbound_photos" ON inbound_ticket_photos
  FOR ALL TO authenticated
  USING (
    ticket_id IN (
      SELECT id FROM inbound_tickets
      WHERE company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    )
  );

CREATE POLICY "tenant_isolation_inbound_notes" ON inbound_ticket_notes
  FOR ALL TO authenticated
  USING (
    ticket_id IN (
      SELECT id FROM inbound_tickets
      WHERE company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    )
  );

GRANT ALL ON inbound_tickets       TO authenticated;
GRANT ALL ON inbound_ticket_photos TO authenticated;
GRANT ALL ON inbound_ticket_notes  TO authenticated;

-- 6. Supabase Storage bucket
-- Run the following JS in a Supabase Edge Function or from the dashboard to create the bucket:
--
--   await supabase.storage.createBucket('inbound-ticket-photos', {
--     public: true,
--     fileSizeLimit: 10485760,   -- 10 MB
--     allowedMimeTypes: ['image/*']
--   });
--
-- Storage path format: {company_id}/{ticket_id}/{uuid}.{ext}
