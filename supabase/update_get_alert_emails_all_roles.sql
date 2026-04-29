-- Update get_alert_emails to return notify_email for all roles in a company,
-- allowing CREW members to also receive no-show and refresh request notifications.
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
      AND  p.notify_email IS NOT NULL
      AND  p.notify_email <> '';
END;
$$;

GRANT EXECUTE ON FUNCTION get_alert_emails(uuid) TO authenticated;
