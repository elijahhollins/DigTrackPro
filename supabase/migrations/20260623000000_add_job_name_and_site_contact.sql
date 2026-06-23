-- =============================================================================
-- Migration: Separate job name from site contact on jobs
--
-- Previously the ticket parser dropped the extracted "site contact" into the
-- jobs.customer column, so the dashboard showed the on-site contact where a
-- job/client label was expected. This migration:
--   * adds jobs.job_name   — a user-entered name shown throughout the app in
--                            place of the old client/customer label, and
--   * adds jobs.site_contact — where the parsed on-site contact now lives.
--
-- PURELY ADDITIVE. Both columns are nullable. Existing rows had the site
-- contact stored in "customer", so we backfill site_contact from customer to
-- preserve that information in the correct field. job_name is left blank for
-- existing jobs and can be filled in from the Update Job Profile screen.
-- =============================================================================

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS job_name text,
  ADD COLUMN IF NOT EXISTS site_contact text;

UPDATE public.jobs
  SET site_contact = customer
  WHERE site_contact IS NULL AND customer IS NOT NULL;
