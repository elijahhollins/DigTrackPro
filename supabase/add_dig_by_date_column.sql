-- Migration: add dig_by_date column to tickets table
-- dig_by_date stores the explicit "Dig By Date" extracted from a locate ticket
-- or entered manually. If NULL, the application falls back to call_in_date + 10 days.
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS dig_by_date date;
