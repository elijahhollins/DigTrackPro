-- ================================================================
-- DigTrack Pro — Add company_id to existing tables
-- ================================================================
-- Run this in Supabase → SQL Editor → New query → Run
--
-- USE THIS FILE if you already have tables in your database that
-- were created BEFORE company_id was part of the schema.
-- (CREATE TABLE IF NOT EXISTS never adds new columns to an
--  existing table, so this ALTER TABLE script is needed instead.)
--
-- SAFE TO RE-RUN: every statement uses IF NOT EXISTS so it will
-- not error if the column already exists.
-- ================================================================


-- ── Step 1: Make sure the companies table exists ───────────────
-- (Everything else references it, so it must be created first.)

CREATE TABLE IF NOT EXISTS companies (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text NOT NULL,
    brand_color text DEFAULT '#3b82f6',
    created_at  timestamp with time zone DEFAULT now()
);


-- ── Step 2: Add company_id to every tenant table ──────────────
--
-- Each ALTER TABLE statement:
--   • Adds the column if it does not already exist  (IF NOT EXISTS)
--   • Links it to the companies table               (REFERENCES)
--   • Leaves it nullable so it works on tables that already have
--     rows — you can backfill and tighten the constraint later
--     if you want, but for a fresh app it won't matter.


-- profiles — users belong to a company
ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id);

-- jobs — every job belongs to a company
ALTER TABLE jobs
    ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id);

-- tickets — every ticket belongs to a company
ALTER TABLE tickets
    ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id);

-- photos — every photo belongs to a company
ALTER TABLE photos
    ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id);

-- notes — every note belongs to a company
ALTER TABLE notes
    ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id);

-- no_shows — every no-show record belongs to a company
ALTER TABLE no_shows
    ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id);

-- job_prints — every uploaded print belongs to a company
ALTER TABLE job_prints
    ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id);

-- company_invites — each invite is scoped to a company
--   (uses ON DELETE CASCADE so invites are removed when the company is)
ALTER TABLE company_invites
    ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id) ON DELETE CASCADE;

-- push_subscriptions — associate notification subscriptions with a company
--   (this table may or may not exist; the ALTER will fail harmlessly
--    if the table hasn't been created yet — just ignore that error)
ALTER TABLE push_subscriptions
    ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES companies(id);


-- ── Step 3: Enable Row Level Security on all tables ────────────
-- (Safe to run even if RLS is already enabled.)

ALTER TABLE companies        ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles         ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets          ENABLE ROW LEVEL SECURITY;
ALTER TABLE photos           ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE no_shows         ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_prints       ENABLE ROW LEVEL SECURITY;
ALTER TABLE print_markers    ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_invites  ENABLE ROW LEVEL SECURITY;


-- ── Step 4: Grant access ───────────────────────────────────────

GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;


-- ================================================================
-- DONE.
--
-- Next step: run fix_company_registration_rls.sql (in the same
-- supabase/ folder) which adds all the Row Level Security policies
-- and helper functions needed for the multi-tenant system to work.
-- ================================================================
