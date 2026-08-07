-- Makes a Supabase schema dump replayable against a vanilla PostgreSQL container.
--
-- A Supabase dump references roles, an `auth` schema, and an `extensions` schema that only exist
-- inside a real Supabase project. Without these stubs every RLS policy in the dump errors out and
-- the drill reports a "successful" restore of almost nothing. This is the single most common
-- reason a naive restore drill silently proves nothing.
--
-- These stubs are for VERIFICATION ONLY. They are deliberately not a working auth system --
-- auth.uid() returns NULL here. The real restore path targets a fresh Supabase project, which
-- provides all of this for real. See docs/DISASTER_RECOVERY.md.

-- Roles referenced by GRANT statements and RLS policies in the dump.
DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY[
    'anon',
    'authenticated',
    'service_role',
    'supabase_admin',
    'supabase_auth_admin',
    'supabase_storage_admin',
    'authenticator',
    'dashboard_user',
    'pgbouncer'
  ] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN', r);
    END IF;
  END LOOP;
END
$$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS storage;
CREATE SCHEMA IF NOT EXISTS extensions;

-- Extensions the app's defaults depend on. gen_random_uuid() backs primary key defaults, so
-- without pgcrypto the data replay fails on insert.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;

-- pgcrypto in the `extensions` schema is not on the default search_path, and the dump calls
-- gen_random_uuid() unqualified. PostgreSQL 13+ provides it in pg_catalog, but define a public
-- shim if it is somehow unavailable so the drill fails on real problems, not on this.
DO $$
BEGIN
  PERFORM gen_random_uuid();
EXCEPTION WHEN undefined_function THEN
  EXECUTE 'CREATE FUNCTION public.gen_random_uuid() RETURNS uuid LANGUAGE sql AS $f$ SELECT extensions.gen_random_uuid() $f$';
END
$$;

-- GoTrue helpers referenced by RLS policies throughout the schema.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
  LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;

CREATE OR REPLACE FUNCTION auth.role() RETURNS text
  LANGUAGE sql STABLE AS $$ SELECT NULL::text $$;

CREATE OR REPLACE FUNCTION auth.email() RETURNS text
  LANGUAGE sql STABLE AS $$ SELECT NULL::text $$;

CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb
  LANGUAGE sql STABLE AS $$ SELECT '{}'::jsonb $$;

-- Minimal auth.users so the auth data-only dump has somewhere to land and so profiles.id's
-- foreign key resolves. Column set is intentionally a subset -- the drill asserts row counts and
-- referential integrity, not GoTrue behavior.
CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY,
  email text,
  encrypted_password text,
  created_at timestamptz,
  updated_at timestamptz,
  raw_user_meta_data jsonb,
  raw_app_meta_data jsonb
);

CREATE TABLE IF NOT EXISTS auth.identities (
  id text,
  user_id uuid,
  identity_data jsonb,
  provider text,
  created_at timestamptz,
  updated_at timestamptz
);

GRANT USAGE ON SCHEMA auth, storage, extensions, public TO anon, authenticated, service_role;
