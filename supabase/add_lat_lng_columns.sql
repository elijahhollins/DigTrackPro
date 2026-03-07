-- Migration: add lat/lng columns to tickets table
-- Run this in the Supabase SQL editor if the tickets table already exists.

ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS lat float8,
  ADD COLUMN IF NOT EXISTS lng float8;
