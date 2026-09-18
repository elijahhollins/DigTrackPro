-- =============================================================================
-- Migration: Ticket update audit log
--
-- PURELY ADDITIVE — adds one new table, `ticket_updates`, holding an append-only
-- history of everything that happens to a dig ticket: creation, admin edits,
-- no-shows, refresh requests and archive toggles. Existing tables, data and RLS
-- helpers are untouched, and the app degrades gracefully if this migration has
-- not been applied yet (logging failures are swallowed by the client).
--
-- The log is deliberately append-only. Unlike `notes`, which crews can delete,
-- these rows have SELECT and INSERT policies only — no UPDATE, no DELETE — so a
-- ticket's history cannot be rewritten from the client. Rows do cascade away
-- with their parent ticket.
--
-- RLS reuses DigTrackPro's existing security-definer helpers:
--   get_user_company_id()  -> uuid  (from profiles)
-- =============================================================================

CREATE TABLE IF NOT EXISTS ticket_updates (
  id          UUID        PRIMARY KEY,
  company_id  UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  ticket_id   UUID        NOT NULL REFERENCES tickets(id)   ON DELETE CASCADE,
  -- Denormalised so the job-history feed can render an entry without a join.
  job_number  TEXT        NOT NULL,
  ticket_no   TEXT        NOT NULL DEFAULT '',
  -- TicketUpdateKind: CREATED | UPDATED | NO_SHOW_LOGGED | NO_SHOW_CLEARED
  --                 | REFRESH_REQUESTED | REFRESH_CLEARED | ARCHIVED | UNARCHIVED
  kind        TEXT        NOT NULL,
  author      TEXT        NOT NULL DEFAULT '',
  author_id   UUID,
  reason      TEXT,
  -- Array of { field, label, before, after } — empty for non-edit events.
  changes     JSONB       NOT NULL DEFAULT '[]'::jsonb,
  timestamp   BIGINT      NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE ticket_updates ENABLE ROW LEVEL SECURITY;

-- Read + append within your own company. No UPDATE/DELETE policies exist, which
-- means those operations are denied for every authenticated client.
DROP POLICY IF EXISTS "ticket_updates_select" ON ticket_updates;
CREATE POLICY "ticket_updates_select" ON ticket_updates
  FOR SELECT USING (company_id = get_user_company_id());

DROP POLICY IF EXISTS "ticket_updates_insert" ON ticket_updates;
CREATE POLICY "ticket_updates_insert" ON ticket_updates
  FOR INSERT WITH CHECK (company_id = get_user_company_id());

CREATE INDEX IF NOT EXISTS ticket_updates_ticket_idx  ON ticket_updates (ticket_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS ticket_updates_company_idx ON ticket_updates (company_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS ticket_updates_job_idx     ON ticket_updates (company_id, job_number, timestamp DESC);
