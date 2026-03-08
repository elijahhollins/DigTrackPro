-- Migration: Add ticket_id column to notes table to support per-ticket notes
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'notes' AND column_name = 'ticket_id'
    ) THEN
        ALTER TABLE notes ADD COLUMN ticket_id uuid REFERENCES tickets(id) ON DELETE CASCADE;
        CREATE INDEX IF NOT EXISTS idx_notes_ticket_id ON notes(ticket_id);
    END IF;
END $$;
