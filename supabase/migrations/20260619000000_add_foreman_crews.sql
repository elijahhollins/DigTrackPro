-- =============================================================================
-- Migration: Foreman crew selection for the Time Tracker
--
-- Lets a designated FOREMAN (a regular, non-admin login that is linked to an
-- employee record) save the same few workers as a personal "crew" and clock
-- the whole crew in/out each day. Workers themselves have no login — only the
-- foreman does. This migration is PURELY ADDITIVE:
--
--   1. employees.is_foreman  — admin-set flag that unlocks crew mode for an
--      employee's linked login.
--   2. time_clock_crews      — one saved crew per foreman (owner_profile_id),
--      a flat list of member employee ids.
--   3. A new RLS policy on time_entries so a foreman may clock IN/OUT the
--      members of their own crew (the existing self-manage policy only allowed
--      managing one's own entry; crew clock-in needs to reach other employees).
--
-- RLS reuses the existing security-definer helper get_user_company_id() and the
-- admin/crew split already used elsewhere in the schema.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. FOREMAN FLAG (admin-managed). Default false → existing behaviour intact.
-- ---------------------------------------------------------------------------
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS is_foreman boolean NOT NULL DEFAULT false;

-- ---------------------------------------------------------------------------
-- 2. PERSONAL CREW (one per foreman login)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS time_clock_crews (
  id               BIGSERIAL PRIMARY KEY,
  company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  owner_profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  name             TEXT NOT NULL DEFAULT 'My Crew',
  member_ids       BIGINT[] NOT NULL DEFAULT '{}',
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- One saved crew per foreman.
CREATE UNIQUE INDEX IF NOT EXISTS time_clock_crews_owner_unique
  ON time_clock_crews (owner_profile_id);
CREATE INDEX IF NOT EXISTS time_clock_crews_company_idx
  ON time_clock_crews (company_id);

ALTER TABLE time_clock_crews ENABLE ROW LEVEL SECURITY;

-- A foreman can read/write only their own crew (and only within their company).
DROP POLICY IF EXISTS "time_clock_crews_owner_manage" ON time_clock_crews;
CREATE POLICY "time_clock_crews_owner_manage" ON time_clock_crews
  FOR ALL TO authenticated
  USING (owner_profile_id = auth.uid() AND company_id = get_user_company_id())
  WITH CHECK (owner_profile_id = auth.uid() AND company_id = get_user_company_id());

-- Admins (ADMIN / SUPER_ADMIN) can read/write any crew in their company so they
-- can seed or fix a foreman's roster. SUPER_ADMIN spans all companies.
DROP POLICY IF EXISTS "time_clock_crews_admin_manage" ON time_clock_crews;
CREATE POLICY "time_clock_crews_admin_manage" ON time_clock_crews
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('ADMIN', 'SUPER_ADMIN')
        AND (p.role = 'SUPER_ADMIN' OR p.company_id = time_clock_crews.company_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid()
        AND p.role IN ('ADMIN', 'SUPER_ADMIN')
        AND (p.role = 'SUPER_ADMIN' OR p.company_id = time_clock_crews.company_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 3. FOREMAN TIME ENTRIES
--    The existing "time_entries_self_manage" policy only lets a login manage
--    the entry for its OWN linked employee. A foreman runs the field, so they
--    may clock IN/OUT any worker in their OWN company -- not just their saved
--    crew. (Scoping to the crew would strand anyone removed from the roster
--    mid-day, leaving them unable to be clocked out.)
--    Scope: caller is a foreman (employees.is_foreman, linked to auth.uid())
--    and the entry belongs to the foreman's company.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "time_entries_foreman_crew_manage" ON time_entries;
CREATE POLICY "time_entries_foreman_crew_manage" ON time_entries
  FOR ALL TO authenticated
  USING (
    company_id = get_user_company_id()
    AND EXISTS (
      SELECT 1 FROM employees fe
      WHERE fe.profile_id = auth.uid()
        AND fe.is_foreman = true
    )
  )
  WITH CHECK (
    company_id = get_user_company_id()
    AND EXISTS (
      SELECT 1 FROM employees fe
      WHERE fe.profile_id = auth.uid()
        AND fe.is_foreman = true
    )
  );

-- ---------------------------------------------------------------------------
-- 4. GRANTS
-- ---------------------------------------------------------------------------
GRANT ALL ON time_clock_crews TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
