-- =============================================================================
-- Migration: Add unit_number, equipment_type, year, make, model to inventory_items
-- =============================================================================

ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS unit_number    TEXT,
  ADD COLUMN IF NOT EXISTS equipment_type TEXT,
  ADD COLUMN IF NOT EXISTS year           SMALLINT,
  ADD COLUMN IF NOT EXISTS make           TEXT,
  ADD COLUMN IF NOT EXISTS model          TEXT;
