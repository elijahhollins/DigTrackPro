-- Add crew assignment support to existing tickets
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS assigned_crew_id uuid REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS assigned_at timestamp with time zone;

CREATE INDEX IF NOT EXISTS idx_tickets_assigned_crew_id ON tickets(assigned_crew_id);
