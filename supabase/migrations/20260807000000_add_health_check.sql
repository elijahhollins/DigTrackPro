-- Health probe for the /api/health endpoint.
--
-- Deliberately a function rather than a table query. Selecting from a table under RLS returns a
-- cheerful 200 with zero rows even when things are wrong, so it cannot distinguish "healthy but
-- empty" from "policies broken" -- and it would leak row visibility to an unauthenticated caller.
-- Executing a function proves Postgres actually ran something and returns no business data at all.

CREATE OR REPLACE FUNCTION public.health_check()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
  SELECT jsonb_build_object(
    'ok', true,
    'now', now()
  );
$$;

COMMENT ON FUNCTION public.health_check() IS
  'Liveness probe for /api/health. Returns no business data; safe to expose to anon.';

REVOKE ALL ON FUNCTION public.health_check() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.health_check() TO anon, authenticated, service_role;
