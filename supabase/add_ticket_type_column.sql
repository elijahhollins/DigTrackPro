-- Add explicit ticket type to separate inbound locate work from refresh/no-show flags
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS ticket_type text DEFAULT 'standard';

UPDATE tickets
SET ticket_type = 'standard'
WHERE ticket_type IS NULL;

CREATE INDEX IF NOT EXISTS idx_tickets_ticket_type ON tickets(ticket_type);
