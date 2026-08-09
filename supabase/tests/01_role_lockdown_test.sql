\set ON_ERROR_STOP 0
\pset pager off

-- ── Seed: one company, an admin, a crew member, and a rival company ──
-- Inserting into auth.users fires handle_new_user(), which creates each
-- profile as CREW with no company. That is the real signup path, and it
-- must survive the migration's guard trigger — if the trigger broke it,
-- these inserts would fail here.
set role none;
insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111','admin@acme.test', '{"name":"Ada Admin"}'),
  ('22222222-2222-2222-2222-222222222222','crew@acme.test',  '{"name":"Cy Crew"}'),
  ('33333333-3333-3333-3333-333333333333','boss@rival.test', '{"name":"Rex Rival"}');

\echo '-- handle_new_user must have created three CREW profiles with no company'
select name, role, company_id is null as no_company from profiles order by name;

insert into companies (id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000001','Acme Digging'),
  ('bbbbbbbb-0000-0000-0000-000000000002','Rival Boring');

-- Assign the seed roles as superuser (guard trigger bypassed via the flag).
select set_config('app.privileged_profile_write','on', false);
update profiles set company_id = 'aaaaaaaa-0000-0000-0000-000000000001', role = 'ADMIN'
  where id = '11111111-1111-1111-1111-111111111111';
update profiles set company_id = 'aaaaaaaa-0000-0000-0000-000000000001', role = 'CREW'
  where id = '22222222-2222-2222-2222-222222222222';
update profiles set company_id = 'bbbbbbbb-0000-0000-0000-000000000002', role = 'SUPER_ADMIN'
  where id = '33333333-3333-3333-3333-333333333333';
select set_config('app.privileged_profile_write','off', false);

\echo ''
\echo '================================================================'
\echo ' ATTACKS — all of these must FAIL'
\echo '================================================================'

-- Become the crew member.
set role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222', false);

\echo ''
\echo '-- 1. Self-escalation to SUPER_ADMIN (the reported vulnerability)'
update profiles set role = 'SUPER_ADMIN' where id = auth.uid();

\echo ''
\echo '-- 2. Self-escalation to ADMIN'
update profiles set role = 'ADMIN' where id = auth.uid();

\echo ''
\echo '-- 3. Lateral: promote a teammate'
update profiles set role = 'ADMIN' where id = '11111111-1111-1111-1111-111111111111';

\echo ''
\echo '-- 4. Lateral: demote the company admin'
update profiles set role = 'CREW' where id = '11111111-1111-1111-1111-111111111111';

\echo ''
\echo '-- 5. Cross-tenant jump by rewriting own company_id'
update profiles set company_id = 'bbbbbbbb-0000-0000-0000-000000000002' where id = auth.uid();

\echo ''
\echo '-- 6. Escalation at INSERT time (role must be silently forced to CREW)'
insert into profiles (id, name, username, role, company_id)
values ('44444444-4444-4444-4444-444444444444','Mallory','m@x.test','SUPER_ADMIN','bbbbbbbb-0000-0000-0000-000000000002');

\echo ''
\echo '-- 7. Delete a teammate as CREW'
delete from profiles where id = '11111111-1111-1111-1111-111111111111';

\echo ''
\echo '-- 8. Grant self SUPER_ADMIN via the RPC'
select set_user_role('11111111-1111-1111-1111-111111111111','SUPER_ADMIN');

\echo ''
\echo '-- 9. Change roles as a non-admin'
select set_user_role('11111111-1111-1111-1111-111111111111','CREW');

\echo ''
\echo '-- 10. Out-of-band promotion function (must have no execute grant)'
select set_super_admin('crew@acme.test');

\echo ''
\echo '-- 11. Read another company''s profiles'
select count(*) as rival_rows_visible from profiles where company_id = 'bbbbbbbb-0000-0000-0000-000000000002';

\echo ''
\echo '-- 12. Set an arbitrary company_id via the super-admin RPC'
select admin_set_user_company('22222222-2222-2222-2222-222222222222','bbbbbbbb-0000-0000-0000-000000000002');

\echo ''
\echo '================================================================'
\echo ' STATE AFTER ATTACKS — roles and companies must be unchanged'
\echo '================================================================'
set role none;
select name, role, (select c.name from companies c where c.id = p.company_id) as company
from profiles p order by name;

\echo ''
\echo '================================================================'
\echo ' LEGITIMATE FLOWS — all of these must SUCCEED'
\echo '================================================================'

\echo ''
\echo '-- A. Crew edits their own name and alert email'
set role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222', false);
update profiles set name = 'Cy Crew Jr', notify_email = 'cy@acme.test' where id = auth.uid();
select name, notify_email from profiles where id = auth.uid();

\echo ''
\echo '-- B. Admin promotes the crew member to ADMIN'
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111', false);
select set_user_role('22222222-2222-2222-2222-222222222222','ADMIN');
set role none;
select name, role from profiles where id = '22222222-2222-2222-2222-222222222222';

\echo ''
\echo '-- C. Admin demotes them back, and edits a teammate''s alert email'
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111', false);
select set_user_role('22222222-2222-2222-2222-222222222222','CREW');
update profiles set notify_email = 'ops@acme.test' where id = '22222222-2222-2222-2222-222222222222';
set role none;
select name, role, notify_email from profiles where id = '22222222-2222-2222-2222-222222222222';

\echo ''
\echo '-- D. New user with no company creates one and becomes its ADMIN'
set role none;
insert into auth.users (id, email) values ('55555555-5555-5555-5555-555555555555','founder@new.test');
set role authenticated;
select set_config('request.jwt.claim.sub','55555555-5555-5555-5555-555555555555', false);
select create_company_and_claim_admin('New Co','#ff0000','Austin','TX','555-1234','Fay Founder','founder@new.test') as new_company_id;
set role none;
select p.name, p.role, c.name as company from profiles p join companies c on c.id = p.company_id
where p.id = '55555555-5555-5555-5555-555555555555';

\echo ''
\echo '-- E. That same user cannot then create a second company'
set role authenticated;
select create_company_and_claim_admin('Sneaky Co');

\echo ''
\echo '-- F. Invite signup: claim a token, land as CREW, token consumed'
set role none;
insert into auth.users (id, email) values ('66666666-6666-6666-6666-666666666666','newhire@acme.test');
insert into company_invites (company_id, token)
values ('aaaaaaaa-0000-0000-0000-000000000001','cccccccc-0000-0000-0000-00000000000c');
set role authenticated;
select set_config('request.jwt.claim.sub','66666666-6666-6666-6666-666666666666', false);
select claim_invite('cccccccc-0000-0000-0000-00000000000c','New Hire','newhire@acme.test') as joined_company;
set role none;
select p.name, p.role, c.name as company from profiles p join companies c on c.id = p.company_id
where p.id = '66666666-6666-6666-6666-666666666666';
select token, used_at is not null as consumed from company_invites;

\echo ''
\echo '-- G. The same invite token cannot be replayed by someone else'
set role none;
insert into auth.users (id, email) values ('77777777-7777-7777-7777-777777777777','replay@x.test');
set role authenticated;
select set_config('request.jwt.claim.sub','77777777-7777-7777-7777-777777777777', false);
select claim_invite('cccccccc-0000-0000-0000-00000000000c','Replay','replay@x.test');

\echo ''
\echo '-- H. Super admin moves a user between companies, then sets their role'
set role authenticated;
select set_config('request.jwt.claim.sub','33333333-3333-3333-3333-333333333333', false);
select admin_set_user_company('66666666-6666-6666-6666-666666666666','bbbbbbbb-0000-0000-0000-000000000002');
select set_user_role('66666666-6666-6666-6666-666666666666','ADMIN');
set role none;
select p.name, p.role, c.name as company from profiles p join companies c on c.id = p.company_id
where p.id = '66666666-6666-6666-6666-666666666666';

\echo ''
\echo '-- I. Admin deletes a teammate (allowed), crew cannot (already shown)'
set role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-1111-1111-111111111111', false);
delete from profiles where id = '22222222-2222-2222-2222-222222222222';
set role none;
select count(*) as acme_profiles_remaining from profiles where company_id = 'aaaaaaaa-0000-0000-0000-000000000001';

\echo ''
\echo '================================================================'
\echo ' HARDENING CHECKS'
\echo '================================================================'
set role none;
\echo ''
\echo '-- SECURITY DEFINER functions must all pin search_path'
select p.proname,
       coalesce(array_to_string(p.proconfig,','),'** MUTABLE **') as config
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
order by p.proname;

\echo ''
\echo '-- Final policy set on profiles (no FOR ALL should remain)'
select policyname, cmd from pg_policies
where schemaname='public' and tablename='profiles' order by cmd, policyname;

\echo ''
\echo '-- anon must not reach any helper; authenticated must keep them (RLS needs it)'
select f.sig,
       has_function_privilege('anon', f.sig, 'execute')          as anon,
       has_function_privilege('authenticated', f.sig, 'execute') as authd
from (values
  ('is_super_admin()'),
  ('get_user_company_id()'),
  ('is_company_admin()'),
  ('is_admin_of_company(uuid)'),
  ('get_alert_emails(uuid)'),
  ('get_company_by_name(text)'),
  ('validate_invite_token(uuid)'),   -- anon SHOULD keep this one
  ('set_super_admin(text)'),         -- nobody
  ('set_user_role(uuid,text)')
) f(sig);

\echo ''
\echo '-- mark_invite_used policy must be gone'
select count(*) as mark_invite_used_policies from pg_policies
where tablename='company_invites' and policyname='mark_invite_used';

\echo ''
\echo '-- role CHECK constraint must reject junk'
select set_config('app.privileged_profile_write','on', false);
update profiles set role = 'GOD' where id = '11111111-1111-1111-1111-111111111111';
select set_config('app.privileged_profile_write','off', false);
