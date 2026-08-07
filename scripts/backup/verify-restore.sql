-- Post-restore assertions for the monthly restore drill.
--
-- The point of these is to make a hollow restore FAIL. A psql replay that emits no errors but
-- produces empty tables looks identical to a successful one unless something checks -- and a
-- backup you have never verified is not a backup.
--
-- Row-count comparison against the dump-time counts.json happens in the workflow (it needs the
-- expected values); this file asserts the things that are checkable from inside the database.

\set ON_ERROR_STOP on

-- 1. The core tables must exist. A schema replay that silently half-failed shows up here.
DO $$
DECLARE
  t text;
  missing text[] := '{}';
BEGIN
  FOREACH t IN ARRAY ARRAY['companies', 'profiles', 'tickets', 'jobs', 'notes', 'photos'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      missing := missing || t;
    END IF;
  END LOOP;

  IF array_length(missing, 1) > 0 THEN
    RAISE EXCEPTION 'Restore is missing expected tables: %', array_to_string(missing, ', ');
  END IF;
END
$$;

-- 2. The tenancy backbone must not be empty. Every other assertion is vacuous if it is.
DO $$
DECLARE
  companies bigint;
  profiles bigint;
BEGIN
  SELECT count(*) INTO companies FROM public.companies;
  SELECT count(*) INTO profiles  FROM public.profiles;

  IF companies = 0 THEN
    RAISE EXCEPTION 'Restore produced zero companies - the data replay did not land.';
  END IF;
  IF profiles = 0 THEN
    RAISE EXCEPTION 'Restore produced zero profiles - the data replay did not land.';
  END IF;

  RAISE NOTICE 'companies=%, profiles=%', companies, profiles;
END
$$;

-- 3. Referential integrity of the multi-tenancy columns. RLS is the only security boundary in
-- this app and it keys entirely off company_id, so a restore with dangling company_ids would
-- produce rows no policy can ever match -- data that exists but is permanently invisible.
DO $$
DECLARE
  orphaned bigint;
BEGIN
  SELECT count(*) INTO orphaned
  FROM public.profiles p
  WHERE p.company_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.companies c WHERE c.id = p.company_id);
  IF orphaned > 0 THEN
    RAISE EXCEPTION '% profile(s) reference a company that does not exist.', orphaned;
  END IF;

  SELECT count(*) INTO orphaned
  FROM public.tickets t
  WHERE t.company_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.companies c WHERE c.id = t.company_id);
  IF orphaned > 0 THEN
    RAISE EXCEPTION '% ticket(s) reference a company that does not exist.', orphaned;
  END IF;

  SELECT count(*) INTO orphaned
  FROM public.jobs j
  WHERE j.company_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.companies c WHERE c.id = j.company_id);
  IF orphaned > 0 THEN
    RAISE EXCEPTION '% job(s) reference a company that does not exist.', orphaned;
  END IF;
END
$$;

-- 4. The auth restore. profiles.id foreign-keys to auth.users; if the auth dump was skipped or
-- failed, every user has silently lost their login while the rest of the restore looks perfect.
-- This is the failure mode most likely to go unnoticed until someone tries to sign in.
DO $$
DECLARE
  users bigint;
  orphaned bigint;
BEGIN
  SELECT count(*) INTO users FROM auth.users;
  IF users = 0 THEN
    RAISE EXCEPTION 'auth.users is empty - nobody would be able to log in after this restore.';
  END IF;

  SELECT count(*) INTO orphaned
  FROM public.profiles p
  WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id);
  IF orphaned > 0 THEN
    RAISE EXCEPTION '% profile(s) have no matching auth.users row.', orphaned;
  END IF;

  RAISE NOTICE 'auth.users=%', users;
END
$$;

-- 5. RLS must still be enabled on tenant tables. A restore that lands the data but drops RLS is
-- worse than a failed restore: every tenant would see every other tenant's tickets.
DO $$
DECLARE
  unprotected text[];
BEGIN
  SELECT array_agg(c.relname ORDER BY c.relname) INTO unprotected
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND c.relname IN ('companies', 'profiles', 'tickets', 'jobs', 'notes', 'photos')
    AND NOT c.relrowsecurity;

  IF unprotected IS NOT NULL THEN
    RAISE EXCEPTION 'RLS is disabled on: %', array_to_string(unprotected, ', ');
  END IF;
END
$$;

SELECT 'Restore verification passed.' AS result;
