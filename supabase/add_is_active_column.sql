-- Add is_active column to companies table for super-admin suspension feature
ALTER TABLE companies ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
