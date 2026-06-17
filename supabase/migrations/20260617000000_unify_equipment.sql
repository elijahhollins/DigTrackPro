-- =============================================================================
-- Migration: Unify equipment between scheduler and inventory modules
--
-- The scheduler's standalone `equipment` table is merged into inventory_items
-- (item_type = 'EQUIPMENT') so both modules share the same equipment records.
--
-- Steps:
--  1. Add hourly_rate to inventory_items
--  2. Add temp column to track old bigint IDs during migration
--  3. Copy existing equipment rows → inventory_items
--  4. Remap schedule_blocks.equipment_ids from BIGINT[] → UUID[]
--  5. Drop temp column and old equipment table
-- =============================================================================

-- 1. Add hourly_rate to inventory_items
ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS hourly_rate NUMERIC(10,2) NOT NULL DEFAULT 0;

-- 2. Temporary column so we can map old bigint IDs → new UUIDs for the blocks update
ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS _old_equip_id BIGINT;

-- 3. Migrate existing equipment rows into inventory_items
INSERT INTO inventory_items (company_id, name, item_type, hourly_rate, _old_equip_id, created_at, updated_at)
SELECT company_id, name, 'EQUIPMENT', hourly_rate, id, NOW(), NOW()
FROM equipment;

-- 4a. Add new UUID[] column alongside the existing BIGINT[] column
ALTER TABLE schedule_blocks
  ADD COLUMN IF NOT EXISTS _equip_uuids UUID[] NOT NULL DEFAULT '{}';

-- 4b. Populate it using the old → new ID mapping (only for rows that had equipment assigned)
UPDATE schedule_blocks sb
SET _equip_uuids = ARRAY(
  SELECT ii.id
  FROM inventory_items ii
  WHERE ii._old_equip_id = ANY(sb.equipment_ids)
    AND ii._old_equip_id IS NOT NULL
  ORDER BY array_position(sb.equipment_ids, ii._old_equip_id)
)
WHERE array_length(sb.equipment_ids, 1) > 0;

-- 4c. Replace the BIGINT[] column with the UUID[] column
ALTER TABLE schedule_blocks DROP COLUMN equipment_ids;
ALTER TABLE schedule_blocks RENAME COLUMN _equip_uuids TO equipment_ids;

-- 5. Clean up
ALTER TABLE inventory_items DROP COLUMN _old_equip_id;
DROP TABLE IF EXISTS equipment;
