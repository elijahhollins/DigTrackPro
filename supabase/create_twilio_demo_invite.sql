-- ════════════════════════════════════════════════════════════════
-- Twilio reviewer demo invite
-- ════════════════════════════════════════════════════════════════
--
-- Creates a throwaway company and an invite token so a Twilio verification
-- reviewer can walk the real opt-in flow end to end.
--
-- Run this in the Supabase SQL Editor. The resulting URL goes in the Twilio
-- verification form's "additional information" field — NOT on the public
-- sms-opt-in page.
--
-- Invite tokens are single-use by design (validate_invite_token requires
-- used_at IS NULL). This script creates several so the reviewer can retry, and
-- section 3 below re-arms them if they all get consumed.
-- ────────────────────────────────────────────────────────────────


-- 1. Create the demo company (idempotent)
INSERT INTO companies (name, brand_color, city, state, is_active)
VALUES ('Twilio Review Demo', '#3b82f6', 'Demo', 'IL', true)
ON CONFLICT (name) DO NOTHING;


-- 2. Issue five invite tokens for it
INSERT INTO company_invites (company_id)
SELECT c.id
  FROM companies c, generate_series(1, 5)
 WHERE c.name = 'Twilio Review Demo';


-- 3. Re-arm every demo invite (run again if the reviewer used them all)
UPDATE company_invites
   SET used_at = NULL
 WHERE company_id = (SELECT id FROM companies WHERE name = 'Twilio Review Demo');


-- 4. Read back the reviewer URLs
SELECT 'https://digtrack.app/?invite=' || ci.token AS reviewer_url,
       ci.used_at
  FROM company_invites ci
  JOIN companies c ON c.id = ci.company_id
 WHERE c.name = 'Twilio Review Demo'
 ORDER BY ci.created_at;


-- ────────────────────────────────────────────────────────────────
-- Cleanup once verification is complete
-- ────────────────────────────────────────────────────────────────
-- DELETE FROM companies WHERE name = 'Twilio Review Demo';
--   (company_invites cascade; delete any demo auth users from
--    Authentication → Users in the dashboard.)
