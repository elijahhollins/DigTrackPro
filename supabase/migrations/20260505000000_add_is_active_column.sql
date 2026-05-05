-- Add is_active column to companies table for super-admin suspension feature
-- CREATE TABLE IF NOT EXISTS ensures this migration also runs cleanly on fresh
-- Supabase preview-branch databases (which start empty, not from production).
CREATE TABLE IF NOT EXISTS companies (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text NOT NULL,
    brand_color text DEFAULT '#3b82f6',
    created_at  timestamp with time zone DEFAULT now()
);

ALTER TABLE companies ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
