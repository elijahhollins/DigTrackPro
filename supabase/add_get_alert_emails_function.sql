-- Returns notify_email for all ADMIN and SUPER_ADMIN profiles in a company.
-- Runs as SECURITY DEFINER so CREW-role callers bypass RLS on profiles.
-- Only the caller's own company is accessible unless the caller is a SUPER_ADMIN.
CREATE OR REPLACE FUNCTION get_alert_emails(p_company_id uuid)
  RETURNS TABLE(notify_email text)
  LANGUAGE plpgsql
  SECURITY DEFINER AS $$
BEGIN
  IF NOT (
    get_user_company_id() = p_company_id
    OR is_super_admin()
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  RETURN QUERY
    SELECT p.notify_email
    FROM   public.profiles p
    WHERE  p.company_id = p_company_id
      AND  p.role IN ('ADMIN', 'SUPER_ADMIN')
      AND  p.notify_email IS NOT NULL
      AND  p.notify_email <> '';
END;
$$;

GRANT EXECUTE ON FUNCTION get_alert_emails(uuid) TO authenticated;
