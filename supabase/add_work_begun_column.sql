-- Migration: add work_begun column to tickets table
-- work_begun tracks whether excavation has started on the ticket.
-- NULL  = not yet answered (no dig-by-date enforcement for legacy tickets)
-- false = user confirmed no work has begun (ticket expires at dig_by_date = call_in_date + 10 days)
-- true  = work has begun (ticket remains valid until the stored expires date)
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS work_begun boolean DEFAULT NULL;
