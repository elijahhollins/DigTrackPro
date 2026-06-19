-- =============================================================================
-- Migration: Structured address fields for inventory locations
--
-- PURELY ADDITIVE — adds city / state / zip columns to inventory_locations so
-- shop addresses can be geocoded with Nominatim's structured search (more
-- accurate than a single free-text line). The existing `address` column keeps
-- the street line. Existing rows default to empty strings and continue to work
-- via the free-text geocoding fallback.
-- =============================================================================

ALTER TABLE public.inventory_locations
  ADD COLUMN IF NOT EXISTS city  TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS state TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS zip   TEXT NOT NULL DEFAULT '';
