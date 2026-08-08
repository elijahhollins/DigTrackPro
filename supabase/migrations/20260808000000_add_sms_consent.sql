-- ════════════════════════════════════════════════════════════════
-- SMS CONSENT — per-user, append-only consent log for Twilio
-- ════════════════════════════════════════════════════════════════
--
-- Consent is stored as an append-only history in `sms_consent`, never as a
-- mutable flag. `profiles.sms_enabled` / `profiles.sms_phone` are the fast
-- lookup used at send time and are derived from the newest consent row.
--
-- Trust model:
--   * Clients may only INSERT their own consent rows and SELECT their own
--     history. No client UPDATE or DELETE at all — revocation goes through
--     the security-definer RPCs below.
--   * `profiles.sms_phone` / `profiles.sms_enabled` are protected by a
--     trigger, because the existing `tenant_isolation_profiles` policy is
--     FOR ALL and would otherwise let any teammate write them.
--   * IP address and user agent are read from the PostgREST request headers
--     inside the RPC, never accepted from the caller's payload.
--
-- Apply via the Supabase SQL Editor (see supabase/README.md).
-- ────────────────────────────────────────────────────────────────


-- ────────────────────────────────────────────────────────────────
-- 1. Consent history table
-- ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS sms_consent (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    company_id           uuid REFERENCES companies(id) ON DELETE SET NULL,
    phone                text NOT NULL,
    consented            boolean NOT NULL,
    consented_at         timestamptz NOT NULL DEFAULT now(),
    consent_text_version text NOT NULL,
    consent_source       text NOT NULL,
    ip_address           inet,
    user_agent           text,
    invite_token         text,
    revoked_at           timestamptz,
    CONSTRAINT sms_consent_phone_e164 CHECK (phone ~ '^\+[1-9][0-9]{7,14}$'),
    CONSTRAINT sms_consent_source_valid CHECK (
      consent_source IN ('invite_signup', 'backfill_modal', 'account_settings')
    )
);

CREATE INDEX IF NOT EXISTS idx_sms_consent_user_id ON sms_consent(user_id);
CREATE INDEX IF NOT EXISTS idx_sms_consent_phone   ON sms_consent(phone);
CREATE INDEX IF NOT EXISTS idx_sms_consent_latest  ON sms_consent(user_id, consented_at DESC);

COMMENT ON TABLE  sms_consent IS 'Append-only per-user SMS consent log. Rows are never updated or deleted by clients; revocation sets revoked_at via revoke_sms_consent().';
COMMENT ON COLUMN sms_consent.consent_source IS 'Where consent was captured: invite_signup, backfill_modal, or account_settings.';
COMMENT ON COLUMN sms_consent.consent_text_version IS 'Version string of the exact consent copy shown to the user (see utils/smsConsent.ts).';


-- ────────────────────────────────────────────────────────────────
-- 2. Fast-lookup columns on profiles
-- ────────────────────────────────────────────────────────────────

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS sms_phone               text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS sms_enabled             boolean NOT NULL DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS sms_consent_prompted_at timestamptz;

COMMENT ON COLUMN profiles.sms_phone   IS 'Current confirmed mobile number in E.164. Writable only by the owning user (enforced by trigger).';
COMMENT ON COLUMN profiles.sms_enabled IS 'Send-time gate. Derived from the newest sms_consent row; never set by an administrator.';
COMMENT ON COLUMN profiles.sms_consent_prompted_at IS 'Set when the one-time backfill consent modal is shown and dismissed, so it never reappears.';


-- ────────────────────────────────────────────────────────────────
-- 3. Row Level Security — sms_consent
--
-- Deliberately NOT modelled on the profiles policies: those use FOR ALL and
-- company-wide USING clauses, which would expose one user's consent record
-- to their teammates and allow cross-user writes.
-- ────────────────────────────────────────────────────────────────

ALTER TABLE sms_consent ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sms_consent_select_own" ON sms_consent;
CREATE POLICY "sms_consent_select_own"
  ON sms_consent
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "sms_consent_insert_own" ON sms_consent;
CREATE POLICY "sms_consent_insert_own"
  ON sms_consent
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- No UPDATE policy and no DELETE policy: with RLS enabled and no matching
-- policy, every client-side update/delete is rejected. Revocation happens
-- only through the security-definer functions below.


-- ────────────────────────────────────────────────────────────────
-- 4. Column-level protection for profiles.sms_phone / sms_enabled
--
-- The existing "tenant_isolation_profiles" policy is FOR ALL across the whole
-- company, so RLS alone would let any teammate write another user's number.
-- A phone number typed in by somebody else is not consent, so block it at the
-- database layer.
-- ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.enforce_sms_columns_owner_only()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY INVOKER
  SET search_path = public AS $$
DECLARE
  v_changed boolean;
BEGIN
  -- Trusted server contexts: service_role (webhooks) and the definer-owned
  -- RPCs below, which do their own auth.uid() checks.
  IF current_user IN ('postgres', 'supabase_admin', 'service_role', 'supabase_auth_admin') THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_changed := NEW.sms_phone IS NOT NULL OR COALESCE(NEW.sms_enabled, false);
  ELSE
    v_changed := NEW.sms_phone IS DISTINCT FROM OLD.sms_phone
              OR NEW.sms_enabled IS DISTINCT FROM OLD.sms_enabled;
  END IF;

  -- Checked in two steps rather than one AND: SQL does not guarantee
  -- short-circuit evaluation, and auth.uid() should not be touched on the
  -- ordinary profile updates (name, role, notify_email) that make up the bulk
  -- of the traffic through this trigger.
  IF NOT v_changed THEN
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'sms_phone and sms_enabled can only be changed by the owning user'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_sms_columns_owner_only ON profiles;
CREATE TRIGGER enforce_sms_columns_owner_only
  BEFORE INSERT OR UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_sms_columns_owner_only();


-- ────────────────────────────────────────────────────────────────
-- 5. Consent capture RPC
--
-- user_id, company_id, IP and user agent are all derived server-side. The
-- caller supplies only what it legitimately owns: the number, the checkbox
-- decision, and which copy it agreed to.
-- ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.record_sms_consent(
    p_phone                text,
    p_consented            boolean,
    p_consent_text_version text,
    p_consent_source       text,
    p_invite_token         text DEFAULT NULL
  )
  RETURNS uuid
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public AS $$
DECLARE
  v_user_id    uuid := auth.uid();
  v_company_id uuid;
  v_headers    json;
  v_ip         inet;
  v_user_agent text;
  v_id         uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'record_sms_consent requires an authenticated session'
      USING ERRCODE = '42501';
  END IF;

  IF p_phone IS NULL OR p_phone !~ '^\+[1-9][0-9]{7,14}$' THEN
    RAISE EXCEPTION 'Phone number must be in E.164 format (e.g. +18155550123)'
      USING ERRCODE = '22023';
  END IF;

  IF p_consent_text_version IS NULL OR btrim(p_consent_text_version) = '' THEN
    RAISE EXCEPTION 'consent_text_version is required' USING ERRCODE = '22023';
  END IF;

  IF p_consent_source NOT IN ('invite_signup', 'backfill_modal', 'account_settings') THEN
    RAISE EXCEPTION 'Unknown consent_source: %', p_consent_source USING ERRCODE = '22023';
  END IF;

  SELECT company_id INTO v_company_id FROM profiles WHERE id = v_user_id;

  BEGIN
    v_headers    := current_setting('request.headers', true)::json;
    v_user_agent := left(v_headers ->> 'user-agent', 1000);
    v_ip := nullif(btrim(split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1)), '')::inet;
  EXCEPTION WHEN OTHERS THEN
    v_ip := NULL;
  END;

  INSERT INTO sms_consent (
    user_id, company_id, phone, consented, consent_text_version,
    consent_source, ip_address, user_agent, invite_token
  ) VALUES (
    v_user_id, v_company_id, p_phone, p_consented, btrim(p_consent_text_version),
    p_consent_source, v_ip, v_user_agent, nullif(btrim(coalesce(p_invite_token, '')), '')
  )
  RETURNING id INTO v_id;

  UPDATE profiles
     SET sms_phone               = p_phone,
         sms_enabled             = p_consented,
         sms_consent_prompted_at = now()
   WHERE id = v_user_id;

  RETURN v_id;
END;
$$;


-- ────────────────────────────────────────────────────────────────
-- 6. Revocation + prompt bookkeeping RPCs
-- ────────────────────────────────────────────────────────────────

-- In-app opt-out. Revokes every live consent row for the caller.
CREATE OR REPLACE FUNCTION public.revoke_sms_consent()
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'revoke_sms_consent requires an authenticated session'
      USING ERRCODE = '42501';
  END IF;

  UPDATE sms_consent
     SET revoked_at = now()
   WHERE user_id = v_user_id
     AND revoked_at IS NULL;

  UPDATE profiles SET sms_enabled = false WHERE id = v_user_id;
END;
$$;

-- Dismissal of the one-time backfill modal.
CREATE OR REPLACE FUNCTION public.mark_sms_consent_prompted()
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'mark_sms_consent_prompted requires an authenticated session'
      USING ERRCODE = '42501';
  END IF;

  UPDATE profiles SET sms_consent_prompted_at = now() WHERE id = v_user_id;
END;
$$;

-- STOP / UNSUBSCRIBE handling for the Twilio inbound webhook. There is no
-- session for an inbound text, so this resolves the user by number instead.
-- Restricted to service_role — the webhook is the only legitimate caller.
CREATE OR REPLACE FUNCTION public.revoke_sms_consent_by_phone(p_phone text)
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public AS $$
DECLARE
  v_user_ids uuid[];
BEGIN
  IF p_phone IS NULL OR p_phone !~ '^\+[1-9][0-9]{7,14}$' THEN
    RETURN 0;
  END IF;

  SELECT coalesce(array_agg(DISTINCT user_id), '{}')
    INTO v_user_ids
    FROM sms_consent
   WHERE phone = p_phone;

  UPDATE sms_consent
     SET revoked_at = now()
   WHERE phone = p_phone
     AND revoked_at IS NULL;

  UPDATE profiles
     SET sms_enabled = false
   WHERE id = ANY(v_user_ids)
      OR sms_phone = p_phone;

  RETURN coalesce(array_length(v_user_ids, 1), 0);
END;
$$;


-- ────────────────────────────────────────────────────────────────
-- 7. Send-time gate (server-side mirror of services/smsService.ts)
--
-- Kept SECURITY DEFINER so a background sender running as service_role can
-- resolve any user, while an ordinary session can only ask about itself.
-- ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.can_send_sms(p_user_id uuid)
  RETURNS TABLE(allowed boolean, phone text, reason text)
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public AS $$
DECLARE
  v_consent   sms_consent%ROWTYPE;
  v_sms_phone text;
  v_enabled   boolean;
  v_jwt_role  text := '';
BEGIN
  -- Not current_user: this function is SECURITY DEFINER, so current_user is
  -- always the owner and would wave every caller through. The request's JWT
  -- role is the only thing that identifies who actually called.
  BEGIN
    v_jwt_role := coalesce(
      nullif(current_setting('request.jwt.claim.role', true), ''),
      nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
      ''
    );
  EXCEPTION WHEN OTHERS THEN
    v_jwt_role := '';
  END;

  -- A browser session may only ask about itself. Background senders arrive
  -- either as service_role through PostgREST or on a direct superuser
  -- connection, where session_user is not rewritten by SECURITY DEFINER.
  IF v_jwt_role <> 'service_role'
     AND session_user NOT IN ('postgres', 'supabase_admin')
     AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RETURN QUERY SELECT false, NULL::text, 'not_authorized'::text;
    RETURN;
  END IF;

  SELECT sms_phone, sms_enabled INTO v_sms_phone, v_enabled
    FROM profiles WHERE id = p_user_id;

  SELECT * INTO v_consent
    FROM sms_consent
   WHERE user_id = p_user_id
   ORDER BY consented_at DESC
   LIMIT 1;

  IF v_consent.id IS NULL THEN
    RETURN QUERY SELECT false, NULL::text, 'no_consent_record'::text;
  ELSIF NOT v_consent.consented THEN
    RETURN QUERY SELECT false, NULL::text, 'consent_declined'::text;
  ELSIF v_consent.revoked_at IS NOT NULL THEN
    RETURN QUERY SELECT false, NULL::text, 'consent_revoked'::text;
  ELSIF NOT coalesce(v_enabled, false) THEN
    RETURN QUERY SELECT false, NULL::text, 'sms_disabled'::text;
  ELSIF v_sms_phone IS NULL OR v_sms_phone !~ '^\+[1-9][0-9]{7,14}$' THEN
    RETURN QUERY SELECT false, NULL::text, 'invalid_phone'::text;
  ELSE
    RETURN QUERY SELECT true, v_sms_phone, NULL::text;
  END IF;
END;
$$;


-- ────────────────────────────────────────────────────────────────
-- 8. Grants
-- ────────────────────────────────────────────────────────────────

REVOKE ALL ON FUNCTION public.record_sms_consent(text, boolean, text, text, text) FROM public;
REVOKE ALL ON FUNCTION public.revoke_sms_consent()                                FROM public;
REVOKE ALL ON FUNCTION public.mark_sms_consent_prompted()                         FROM public;
REVOKE ALL ON FUNCTION public.revoke_sms_consent_by_phone(text)                   FROM public;
REVOKE ALL ON FUNCTION public.can_send_sms(uuid)                                  FROM public;

GRANT EXECUTE ON FUNCTION public.record_sms_consent(text, boolean, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_sms_consent()                                TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_sms_consent_prompted()                         TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_send_sms(uuid)                                  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.revoke_sms_consent_by_phone(text)                   TO service_role;
