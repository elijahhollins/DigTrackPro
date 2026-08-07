# Role lockdown regression test

Proves that the privilege escalation fixed in
`../migrations/20260807000000_lock_down_profile_roles.sql` stays fixed. Runs against a
throwaway local Postgres — it never touches a Supabase project.

`00_stub_schema.sql` stands in for the parts of Supabase the migration depends on: `auth.users`,
an `auth.uid()` that reads the same GUC PostgREST sets, the `anon`/`authenticated` roles, the
base tables, and **the original vulnerable policies** — so the test also proves the migration
removes them rather than layering on top.

`01_role_lockdown_test.sql` impersonates a crew member by setting `role authenticated` and
`request.jwt.claim.sub`, then runs twelve attacks that must fail, nine legitimate flows that
must succeed, and a set of hardening assertions.

## Running it

```sh
export PGBIN=/usr/lib/postgresql/16/bin
export PGDATA=/tmp/digtrack-pgtest

rm -rf "$PGDATA" && mkdir -p "$PGDATA" && chown -R postgres "$PGDATA"
su postgres -c "$PGBIN/initdb -D $PGDATA -U testadmin --auth=trust"
su postgres -c "$PGBIN/pg_ctl -D $PGDATA -o '-p 55432 -k /tmp' -l $PGDATA/pg.log start"

psql -h /tmp -p 55432 -U testadmin -d postgres -c "create database digtrack"
psql -h /tmp -p 55432 -U testadmin -d digtrack -v ON_ERROR_STOP=1 -f supabase/tests/00_stub_schema.sql
psql -h /tmp -p 55432 -U testadmin -d digtrack -v ON_ERROR_STOP=1 -f supabase/migrations/20260807000000_lock_down_profile_roles.sql
psql -h /tmp -p 55432 -U testadmin -d digtrack -f supabase/tests/01_role_lockdown_test.sql
```

**Run the test file exactly once per database.** It seeds fixed UUIDs and mutates state as it
goes, so a second run against the same database produces misleading failures. Drop and recreate
`digtrack` between runs.

## Reading the output

`ON_ERROR_STOP` is off, so psql prints errors and keeps going — for the attack section, an
`ERROR` *is* the pass condition. What to look for:

- **Attacks 1–12**: every one must produce `ERROR`, `UPDATE 0`, or `DELETE 0`. The state dump
  immediately after must still show `Ada Admin | ADMIN`, `Cy Crew | CREW`,
  `Rex Rival | SUPER_ADMIN`, each in their original company.
- **Flows A–I**: only two errors are expected — **E** (`You already belong to a company`) and
  **G** (`Invite link is invalid or has already been used`). Both are assertions that a guard
  fires. Any other error in this section is a real regression.
- **Hardening**: all 14 `SECURITY DEFINER` functions must show a pinned `search_path`; the
  `profiles` policy list must contain no `ALL` in the `cmd` column;
  `anon_can_call_get_company_by_name` and `authd_can_call_set_super_admin` must both be `f`;
  `mark_invite_used_policies` must be `0`; and the final statement must fail on
  `profiles_role_valid`.

## Teardown

```sh
su postgres -c "$PGBIN/pg_ctl -D $PGDATA stop" && rm -rf "$PGDATA"
```
