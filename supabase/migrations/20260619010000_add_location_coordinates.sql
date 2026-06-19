-- =============================================================================
-- Migration: Persisted coordinates for inventory locations
--
-- PURELY ADDITIVE — adds nullable lat / lng columns to inventory_locations so a
-- shop's geocoded position can be saved once and reused, instead of being
-- re-geocoded against Nominatim every time the equipment map opens. This mirrors
-- how dig tickets persist their coordinates (tickets.geotag_lat/geotag_lng) and
-- fixes the equipment map getting stuck on "Locating…" with no pin whenever the
-- public Nominatim endpoint rate-limits or fails.
--
-- Columns are nullable and default NULL; a NULL pair means "not geocoded yet"
-- and triggers a one-time geocode the next time the location is shown.
-- =============================================================================

ALTER TABLE public.inventory_locations
  ADD COLUMN IF NOT EXISTS lat DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS lng DOUBLE PRECISION;
