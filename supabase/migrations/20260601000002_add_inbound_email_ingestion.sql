-- Migration: add inbound email connection + ingestion tracking for inbound tickets

CREATE TABLE IF NOT EXISTS inbound_email_connections (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  email_address     text NOT NULL DEFAULT '',
  host              text NOT NULL DEFAULT '',
  port              integer NOT NULL DEFAULT 993,
  username          text NOT NULL DEFAULT '',
  password_encrypted text NOT NULL DEFAULT '',
  use_tls           boolean NOT NULL DEFAULT true,
  mailbox           text NOT NULL DEFAULT 'INBOX',
  subject_filter    text,
  sender_allowlist  text[] NOT NULL DEFAULT '{}',
  auto_import       boolean NOT NULL DEFAULT true,
  last_synced_at    timestamp with time zone,
  last_error        text,
  created_by        uuid REFERENCES profiles(id),
  updated_by        uuid REFERENCES profiles(id),
  created_at        timestamp with time zone NOT NULL DEFAULT now(),
  updated_at        timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT inbound_email_connections_company_unique UNIQUE (company_id)
);

CREATE TABLE IF NOT EXISTS inbound_email_messages (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  connection_id     uuid NOT NULL REFERENCES inbound_email_connections(id) ON DELETE CASCADE,
  message_uid       bigint NOT NULL,
  message_id        text,
  subject           text NOT NULL DEFAULT '',
  from_email        text NOT NULL DEFAULT '',
  received_at       timestamp with time zone,
  parse_status      text NOT NULL DEFAULT 'imported'
                      CHECK (parse_status IN ('imported', 'updated', 'skipped', 'failed')),
  error_message     text,
  inbound_ticket_id uuid REFERENCES inbound_tickets(id) ON DELETE SET NULL,
  created_at        timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT inbound_email_messages_connection_uid_unique UNIQUE (connection_id, message_uid)
);

CREATE INDEX IF NOT EXISTS idx_inbound_email_messages_company_id ON inbound_email_messages (company_id);
CREATE INDEX IF NOT EXISTS idx_inbound_email_messages_ticket_id ON inbound_email_messages (inbound_ticket_id);

CREATE OR REPLACE FUNCTION set_inbound_email_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_inbound_email_updated_at ON inbound_email_connections;
CREATE TRIGGER trg_set_inbound_email_updated_at
BEFORE UPDATE ON inbound_email_connections
FOR EACH ROW
EXECUTE FUNCTION set_inbound_email_updated_at();

ALTER TABLE inbound_email_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbound_email_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_manage_inbound_email_connections" ON inbound_email_connections
  FOR ALL TO authenticated
  USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1
      FROM profiles
      WHERE id = auth.uid()
        AND role IN ('ADMIN', 'SUPER_ADMIN')
    )
  )
  WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1
      FROM profiles
      WHERE id = auth.uid()
        AND role IN ('ADMIN', 'SUPER_ADMIN')
    )
  );

CREATE POLICY "tenant_read_inbound_email_messages" ON inbound_email_messages
  FOR SELECT TO authenticated
  USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
  );

CREATE POLICY "admin_manage_inbound_email_messages" ON inbound_email_messages
  FOR ALL TO authenticated
  USING (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1
      FROM profiles
      WHERE id = auth.uid()
        AND role IN ('ADMIN', 'SUPER_ADMIN')
    )
  )
  WITH CHECK (
    company_id = (SELECT company_id FROM profiles WHERE id = auth.uid())
    AND EXISTS (
      SELECT 1
      FROM profiles
      WHERE id = auth.uid()
        AND role IN ('ADMIN', 'SUPER_ADMIN')
    )
  );

GRANT ALL ON inbound_email_connections TO authenticated;
GRANT ALL ON inbound_email_messages TO authenticated;
