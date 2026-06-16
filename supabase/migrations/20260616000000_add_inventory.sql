-- =============================================================================
-- Migration: Add Inventory Tracking module
--
-- PURELY ADDITIVE — adds a feature flag column to companies and three new
-- tables. Existing data and RLS helpers are untouched. The live app is
-- unaffected until a company has `inventory_enabled = true`.
--
-- RLS reuses DigTrackPro's existing security-definer helpers:
--   get_user_company_id()  -> uuid  (from profiles)
--   is_super_admin()       -> bool  (from profiles)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 0. FEATURE FLAG
-- ---------------------------------------------------------------------------
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS inventory_enabled boolean NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- 1. INVENTORY LOCATIONS (yards, warehouses, storage sites)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_locations (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL DEFAULT '',
  address     TEXT        NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE inventory_locations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "inv_locations_select" ON inventory_locations;
CREATE POLICY "inv_locations_select" ON inventory_locations FOR SELECT USING (company_id = get_user_company_id());
DROP POLICY IF EXISTS "inv_locations_insert" ON inventory_locations;
CREATE POLICY "inv_locations_insert" ON inventory_locations FOR INSERT WITH CHECK (company_id = get_user_company_id());
DROP POLICY IF EXISTS "inv_locations_update" ON inventory_locations;
CREATE POLICY "inv_locations_update" ON inventory_locations FOR UPDATE USING (company_id = get_user_company_id());
DROP POLICY IF EXISTS "inv_locations_delete" ON inventory_locations;
CREATE POLICY "inv_locations_delete" ON inventory_locations FOR DELETE USING (company_id = get_user_company_id());
CREATE INDEX IF NOT EXISTS inv_locations_company_idx ON inventory_locations (company_id);

-- ---------------------------------------------------------------------------
-- 2. INVENTORY ITEMS (equipment/vehicles + materials/supplies)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_items (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name                TEXT        NOT NULL DEFAULT '',
  item_type           TEXT        NOT NULL DEFAULT 'EQUIPMENT' CHECK (item_type IN ('EQUIPMENT','MATERIAL')),
  -- equipment fields
  serial_number       TEXT,
  license_plate       TEXT,
  vin                 TEXT,
  asset_tag           TEXT,
  last_service_date   DATE,
  next_service_due    DATE,
  odometer            NUMERIC(10,1),
  -- material fields
  quantity            NUMERIC(12,3) NOT NULL DEFAULT 0,
  unit                TEXT         NOT NULL DEFAULT 'each',
  -- current state (both types)
  current_location_id UUID         REFERENCES inventory_locations(id) ON DELETE SET NULL,
  current_job_id      UUID         REFERENCES jobs(id) ON DELETE SET NULL,
  current_assignee_id UUID         REFERENCES profiles(id) ON DELETE SET NULL,
  notes               TEXT         NOT NULL DEFAULT '',
  created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "inv_items_select" ON inventory_items;
CREATE POLICY "inv_items_select" ON inventory_items FOR SELECT USING (company_id = get_user_company_id());
DROP POLICY IF EXISTS "inv_items_insert" ON inventory_items;
CREATE POLICY "inv_items_insert" ON inventory_items FOR INSERT WITH CHECK (company_id = get_user_company_id());
DROP POLICY IF EXISTS "inv_items_update" ON inventory_items;
CREATE POLICY "inv_items_update" ON inventory_items FOR UPDATE USING (company_id = get_user_company_id());
DROP POLICY IF EXISTS "inv_items_delete" ON inventory_items;
CREATE POLICY "inv_items_delete" ON inventory_items FOR DELETE USING (company_id = get_user_company_id());
CREATE INDEX IF NOT EXISTS inv_items_company_idx  ON inventory_items (company_id);
CREATE INDEX IF NOT EXISTS inv_items_type_idx     ON inventory_items (item_type);
CREATE INDEX IF NOT EXISTS inv_items_location_idx ON inventory_items (current_location_id);

-- ---------------------------------------------------------------------------
-- 3. INVENTORY MOVEMENTS (audit log for every change)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_movements (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID        NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  item_id             UUID        NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
  movement_type       TEXT        NOT NULL CHECK (movement_type IN ('CHECK_OUT','CHECK_IN','TRANSFER','CONSUME','ASSIGN','RETURN')),
  -- who performed it
  performed_by_id     UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  performed_by_name   TEXT        NOT NULL DEFAULT '',
  -- optional job link
  job_id              UUID        REFERENCES jobs(id) ON DELETE SET NULL,
  job_number          TEXT,
  -- location context
  from_location_id    UUID        REFERENCES inventory_locations(id) ON DELETE SET NULL,
  to_location_id      UUID        REFERENCES inventory_locations(id) ON DELETE SET NULL,
  assignee_id         UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  assignee_name       TEXT,
  -- material quantity delta (negative = consumed)
  quantity_delta      NUMERIC(12,3),
  notes               TEXT        NOT NULL DEFAULT '',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
-- Everyone in the company can read movements
DROP POLICY IF EXISTS "inv_movements_select" ON inventory_movements;
CREATE POLICY "inv_movements_select" ON inventory_movements FOR SELECT USING (company_id = get_user_company_id());
-- Anyone in the company can INSERT their own movements (crew logs their own work)
DROP POLICY IF EXISTS "inv_movements_insert" ON inventory_movements;
CREATE POLICY "inv_movements_insert" ON inventory_movements FOR INSERT WITH CHECK (company_id = get_user_company_id());
-- Only update/delete by the same company (admin-level action enforced in app)
DROP POLICY IF EXISTS "inv_movements_update" ON inventory_movements;
CREATE POLICY "inv_movements_update" ON inventory_movements FOR UPDATE USING (company_id = get_user_company_id());
DROP POLICY IF EXISTS "inv_movements_delete" ON inventory_movements;
CREATE POLICY "inv_movements_delete" ON inventory_movements FOR DELETE USING (company_id = get_user_company_id());
CREATE INDEX IF NOT EXISTS inv_movements_company_idx ON inventory_movements (company_id);
CREATE INDEX IF NOT EXISTS inv_movements_item_idx    ON inventory_movements (item_id);
CREATE INDEX IF NOT EXISTS inv_movements_date_idx    ON inventory_movements (created_at DESC);

-- ---------------------------------------------------------------------------
-- 4. GRANTS
-- ---------------------------------------------------------------------------
GRANT ALL ON inventory_locations, inventory_items, inventory_movements TO authenticated;
