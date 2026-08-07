# Role lockdown — what changed and how to deploy it

## The vulnerability

Any signed-in user could make themselves a super admin from the browser console:

```js
await supabase.from('profiles').update({ role: 'SUPER_ADMIN' }).eq('id', <their own uid>)
```

`profiles` carried two `FOR ALL` RLS policies:

```sql
allow_own_profile          USING/WITH CHECK (id = auth.uid())
tenant_isolation_profiles  USING (company_id = get_user_company_id())   -- no WITH CHECK
```

`FOR ALL` includes UPDATE, `profiles.role` was an unconstrained `text` column, and nothing
guarded it. Three consequences:

- **Self-escalation.** Write any value into your own `role`.
- **Lateral escalation.** `tenant_isolation_profiles` had no `WITH CHECK`, so Postgres reused
  its `USING` clause as the check — you could rewrite *any teammate's* role, including demoting
  your company's real admin.
- **Deletion.** The same `FOR ALL` grant let any crew member delete a teammate's profile.

Every authorization gate in the product reads that column — `is_super_admin()`,
`is_company_admin()`, `is_admin_of_company()`, `get_alert_emails()`, and roughly fifteen inline
`role IN ('ADMIN','SUPER_ADMIN')` predicates across the time-tracking, invoice, daily-report and
inbound-ticket policies. So one crew account converted to `SUPER_ADMIN` and from there had
cross-tenant read/write on every company in the platform.

## The fix

Four layers, in `supabase/migrations/20260807000000_lock_down_profile_roles.sql`:

1. **A CHECK constraint** pinning `role` to `CREW` / `ADMIN` / `SUPER_ADMIN`.
2. **A `BEFORE INSERT OR UPDATE` trigger** that rejects any direct write to `role` or
   `company_id`. This is the load-bearing piece — RLS alone cannot express it, because a
   `WITH CHECK` expression cannot reference the `OLD` row, so no policy can say "role must be
   unchanged."
3. **Per-command policies** replacing the two `FOR ALL` ones. The policies decide *which rows*
   you may touch; the trigger decides *which columns*. Because the trigger is absolute, the
   row-level policies can stay generous enough for admins to edit teammates' names and alert
   emails without reopening escalation.
4. **`SECURITY DEFINER` RPCs** for every legitimate change, each checking the caller's authority
   before writing.

Authorized paths announce themselves with a transaction-local GUC
(`app.privileged_profile_write`) that the trigger honors. A PostgREST client cannot set it —
PostgREST only forwards `request.*` settings, and `set_config` is not an exposed RPC — so the
flag is reachable only from inside the functions that set it.

| RPC | Who may call it |
|---|---|
| `set_user_role(uuid, text)` | ADMIN (own company only) or SUPER_ADMIN. Refuses to grant or revoke `SUPER_ADMIN`, and refuses self-changes. |
| `admin_set_user_company(uuid, uuid)` | SUPER_ADMIN only. |
| `create_company_and_claim_admin(...)` | Any user who does not yet belong to a company. |
| `claim_invite(uuid, ...)` | Any user without a company, holding a valid unused token. Consumes the token atomically. |
| `join_company_by_name(text, ...)` | Any user without a company. |
| `set_super_admin(text)` | Nobody through the API — `execute` is revoked from `anon` and `authenticated`. |

### SUPER_ADMIN is not grantable in-app

By design. To promote someone, run this in the Supabase SQL editor:

```sql
select set_super_admin('person@example.com');
```

The user must have signed in at least once so a profile row exists.

## Deploying

Order matters. **Apply the migration first**, then ship the frontend. The trigger rejects the
old client's writes, so a frontend deployed ahead of the migration is not a problem, but a
migration applied after the frontend means a window where onboarding calls RPCs that do not
exist yet.

1. **Audit first.** The hole was open, so check whether it was used:

   ```sql
   -- Every non-CREW account. Review by hand.
   select id, name, username, role, company_id, created_at
   from profiles where role <> 'CREW' order by role, created_at;

   -- Values outside the enum are evidence of tampering (and block the constraint).
   select role, count(*) from profiles group by role;

   -- What policies does production actually have right now?
   select policyname, cmd, qual, with_check
   from pg_policies where schemaname='public' and tablename='profiles';
   ```

   An unexpected `SUPER_ADMIN` or `ADMIN` is an incident, not a bug. Demote it and review that
   account's activity in the Supabase logs before shipping.

   Note the migration's first statement resets any out-of-enum role to `CREW`. Reconcile that
   against the audit rather than running it blind.

2. **Apply the migration** — `supabase db push`, or paste the file into the SQL editor.

3. **Deploy the edge function and frontend.**

   ```sh
   supabase functions deploy send-alert-email
   supabase secrets set ALLOWED_ORIGINS=https://your-app-domain
   ```

4. **Verify** (see below).

## Verifying

As a CREW user in the real app, from the browser console:

```js
const uid = (await supabase.auth.getUser()).data.user.id;
console.log(await supabase.from('profiles').update({ role: 'SUPER_ADMIN' }).eq('id', uid).select());
```

Expect error `42501`, message naming `set_user_role()`. Then confirm each of these also fails:

- the same update against a teammate's id (lateral escalation)
- `.update({ company_id: '<another company uuid>' })` (cross-tenant jump)
- `.insert({ id: uid, role: 'SUPER_ADMIN' })` (escalation at creation — the trigger forces `CREW`)
- `.delete().eq('id', '<teammate id>')` as CREW (should fail; should succeed as ADMIN)
- `supabase.rpc('set_user_role', { p_user_id: '<someone>', p_role: 'SUPER_ADMIN' })` as an ADMIN
- `supabase.rpc('set_super_admin', { p_email: '<you>' })` (no execute grant)

Confirm against the database that no row actually changed, not just that the client saw an error.

Then confirm nothing legitimate broke — these are the flows the trigger is most likely to have
caught: admin toggles a teammate CREW↔ADMIN; invite signup lands in the right company and
consumes the token; name-based crew signup; a user with no company creates one and becomes its
ADMIN; a super admin moves a user between companies; a user edits their own name and alert
email; an admin edits a teammate's name and alert email.

Finally re-run the security advisors — the `function_search_path_mutable` warnings should be
gone.

## Also fixed

- **Seven `SECURITY DEFINER` functions had a mutable `search_path`.** All now pin
  `search_path = public, pg_temp`. `get_company_by_name` also lost its `anon` grant — it was an
  unauthenticated oracle for whether a company name exists. `validate_invite_token` keeps `anon`
  because the invite landing page resolves a token before sign-in.
- **`mark_invite_used` was `USING (used_at IS NULL) WITH CHECK (true)`** — any signed-in user
  could burn any outstanding invite for any company. The policy is dropped; `claim_invite()`
  consumes the token in the same transaction that grants membership.
- **Signup metadata was trusted for company membership.** `company_id` in
  `auth.users.raw_user_meta_data` is set by the client at signup, so
  `signUp({ options: { data: { company_id: <any company> } } })` was enough to join any company.
  The invite path now requires a valid `invite_token`; metadata alone no longer grants
  membership.
- **`send-alert-email` was an authenticated open relay.** It took an `adminEmails` array from
  the request body and mailed it, with no caller check in code. It now verifies the caller's
  JWT and resolves recipients server-side through `get_alert_emails()`, which does its own
  authorization check. It also escapes every interpolated field — `actor`, `ticketNo`,
  `jobNumber`, `street`, `city`, `state` and `expires` were being injected into the email HTML
  raw. `verify_jwt = true` is now declared explicitly in `config.toml`.

## Known weaknesses left in place

These are pre-existing and out of scope for this fix, but worth a decision:

- **`join_company_by_name` lets anyone who knows a company's name join it.** That is how crew
  signup works today. The durable answer is to retire name-based joining and require invite
  tokens; the RPC exists so that behavior is at least confined to one auditable place.
- **`allow_company_insert` on `companies` is `WITH CHECK (true)`.** Any authenticated user can
  create a company row. They can no longer attach themselves to an arbitrary one, so the impact
  is orphan-row spam rather than escalation.
- **`DigTrackPro-main/`** is a committed stale copy of the whole application carrying the
  original vulnerable code. It is not built by `vite.config.ts`, so it is not exploitable, but
  it will mislead the next person auditing this — including any grep-based review. Worth
  deleting.
- **Schema drift.** The core schema (`profiles`, `companies`, `jobs`, `tickets`, …) lives only
  in hand-applied scripts at `supabase/*.sql`, not in `supabase/migrations/`. That means the
  repo cannot answer "what does production have," which is part of why this went unnoticed.
  Worth consolidating.
