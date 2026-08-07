# Disaster Recovery

How DigTrack Pro's data is backed up, and how to get it back.

## What this protects against

DigTrack Pro is a static React app on Vercel talking directly to Supabase. There is no application
server, and Vercel's CDN is already redundant — so the thing worth protecting is **Supabase**, which
holds auth, Postgres, Storage, Realtime, and the alert-email function. If the Supabase project is
lost or damaged, nothing else in the stack matters.

**This is genuinely the only off-platform copy of the data.** Supabase's own daily backups are not
downloadable on the free tier, and PITR is a paid add-on. If `backup.yml` stops running, you have no
backups at all — which is why the dead-man's switch below is not optional.

Covered: accidental deletes, bad migrations, a corrupted or deleted project, losing access to the
Supabase account.

**Not covered: a live Supabase outage.** There is no hot standby, deliberately — auth users and JWT
secrets don't transfer cleanly between projects, so failover would be partial and risky. During a
Supabase outage the app is down; the offline layer in the client keeps crews working from cached
data, but no new data moves. Recovery time from these backups is on the order of an hour, not
seconds.

## What gets backed up

| Project | Ref | Contents |
|---|---|---|
| `digtrackpro` | `fusubnzndmngjfgatzrq` | Main app — Postgres + auth + 4 storage buckets |
| `landing-crm` | `jjksmzwizmwearwxkdam` | Landing-page CRM — Postgres + auth |

Nightly at 08:00 UTC (03:00 ET) via `.github/workflows/backup.yml`:

- `roles.sql`, `schema.sql`, `data.sql` — the database
- `auth.sql` — `auth.users` and `auth.identities`, **separately and deliberately**. `profiles.id`
  foreign-keys to `auth.users`; a restore without it leaves every user unable to log in and every
  profile orphaned, while looking complete.
- `counts.json` — exact per-table row counts, used by the drill to prove a restore actually landed
- Storage buckets — `job-photos`, `job-prints`, `Ticket_Images`, `inbound-ticket-photos`, mirrored
  incrementally

Everything is encrypted with [age](https://github.com/FiloSottile/age) before upload. Dumps contain
tenant PII and bcrypt password hashes.

### Layout in R2

```
r2://<bucket>/
  digtrackpro/daily/YYYY-MM-DD/{roles,schema,data,auth}.sql.age + counts.json
  digtrackpro/weekly/YYYY-Www/...        # promoted on Sundays
  digtrackpro/monthly/YYYY-MM/...        # promoted on the 1st
  digtrackpro/storage/<bucket>/...       # incremental mirror + manifest.json
  landing-crm/daily/...
```

Retention is enforced by **R2 lifecycle rules per prefix**, never by the workflow: daily 30 days,
weekly 12 weeks, monthly 12 months.

## One-time setup

### 1. Cloudflare R2

Create a bucket (10 GB free, zero egress — which is what makes restore drills free enough that you
actually run them).

Create an API token with **`PutObject` but NOT `DeleteObject`**. This is deliberate and load-bearing:
a leaked CI token then cannot destroy your backup history. It is the difference between a backup and
a synchronized copy of your mistakes. Do not add a cleanup step to the workflow — use lifecycle
rules.

Add lifecycle rules by prefix:

| Prefix | Expire after |
|---|---|
| `*/daily/` | 30 days |
| `*/weekly/` | 84 days |
| `*/monthly/` | 365 days |

### 2. Encryption keypair

```bash
age-keygen -o backup-key.txt          # prints the public key to stderr
```

- **Public key** → `BACKUP_AGE_PUBLIC_KEY` secret. CI only ever holds this, so a CI compromise
  cannot read historical backups.
- **Private key** → store offline (password manager + a second location). Add it as
  `BACKUP_AGE_PRIVATE_KEY` **only** so the restore drill can decrypt.

> Lose the private key and every backup becomes unreadable. Store it somewhere that survives losing
> access to GitHub and Cloudflare both.

### 3. Database connection strings

From Supabase → Project Settings → Database → Connection string → **Session pooler**.

Two things that will otherwise waste an afternoon:

- Use the **session pooler** host (`aws-N-<region>.pooler.supabase.com`), not
  `db.<ref>.supabase.co`. Direct connections are IPv6-only without the paid IPv4 add-on, and GitHub
  runners are IPv4-only — a direct connection fails with "Network is unreachable".
- Use port **5432** (session mode), not 6543. Transaction pooling breaks `pg_dump`'s session
  semantics.
- Copy the hostname exactly; the `aws-0-` / `aws-1-` prefix varies per project even in the same
  region.

The backup workflow's preflight step checks all three and gives a specific error rather than a
confusing connection failure.

### 4. Monitoring (see also the health endpoint in `api/health.js`)

Create a **heartbeat/cron monitor** (Better Stack's free tier includes these) with an expected
period of ~26 hours, and set its URL as `BACKUP_HEARTBEAT_URL`.

This is the most important monitor you will configure. GitHub emails you when a workflow *fails* —
but not when it *never runs*, and **GitHub automatically disables scheduled workflows after 60 days
of repository inactivity**. For a backup cron on a quiet repo, that failure mode produces complete
silence. The heartbeat is what turns silence into a page.

Do the same with `RESTORE_DRILL_HEARTBEAT_URL` for the monthly drill.

### 5. Repository secrets

| Secret | Purpose |
|---|---|
| `SUPABASE_DB_URL` | Main project, session pooler connection string |
| `SUPABASE_URL` | Main project API URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Main project service role — storage backup only, **never** in client code |
| `LP_SUPABASE_DB_URL` | Landing CRM connection string |
| `LP_SUPABASE_URL` | Landing CRM API URL |
| `LP_SUPABASE_SERVICE_ROLE_KEY` | Landing CRM service role |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | R2 destination |
| `BACKUP_AGE_PUBLIC_KEY` | Encryption (backup workflow) |
| `BACKUP_AGE_PRIVATE_KEY` | Decryption (drill workflow only) |
| `BACKUP_HEARTBEAT_URL`, `RESTORE_DRILL_HEARTBEAT_URL` | Dead-man's switches |

### ⚠️ The landing CRM is currently paused

`jjksmzwizmwearwxkdam` is INACTIVE. **A paused Supabase project cannot be dumped**, and free-tier
projects re-pause after 7 days idle. Resume it before the first backup run, and expect its job to
fail whenever it has paused again — the preflight step reports that explicitly. If the CRM matters,
either keep it active or accept that its backups are intermittent. Free-tier projects left paused
long enough are eventually subject to deletion, so it is presently the least-protected data you have.

## Restoring

### Restore into a fresh Supabase project (the real path)

1. **Create a new Supabase project.** Match the Postgres major version (**17**).

2. **Fetch and decrypt the backup:**
   ```bash
   aws s3 cp "s3://<bucket>/digtrackpro/daily/<YYYY-MM-DD>/" ./restore/ \
     --recursive --endpoint-url "https://<account>.r2.cloudflarestorage.com"

   for f in restore/*.age; do age -d -i backup-key.txt -o "${f%.age}" "$f"; done
   ```

3. **Replay, in this order.** Order matters — schema before data, auth before profiles.
   ```bash
   NEW_DB_URL='postgresql://postgres.<newref>:<pw>@aws-0-<region>.pooler.supabase.com:5432/postgres'

   psql "$NEW_DB_URL" -f restore/roles.sql      # may warn about existing roles; fine
   psql "$NEW_DB_URL" -f restore/schema.sql
   psql "$NEW_DB_URL" -v ON_ERROR_STOP=1 -f restore/auth.sql
   psql "$NEW_DB_URL" -v ON_ERROR_STOP=1 -f restore/data.sql
   ```

4. **Verify before cutting over:**
   ```bash
   psql "$NEW_DB_URL" -f scripts/backup/verify-restore.sql
   ```

5. **Restore storage buckets:**
   ```bash
   aws s3 cp "s3://<bucket>/digtrackpro/storage/" ./storage/ \
     --recursive --endpoint-url "https://<account>.r2.cloudflarestorage.com"
   ```
   Then re-upload per bucket with the Supabase CLI or the dashboard. Recreate the four buckets
   first; `inbound-ticket-photos` is normally created by the app at runtime.

6. **Point the app at the new project.** In Vercel → Settings → Environment Variables, update
   `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, then **redeploy** (they are inlined at build
   time — changing them without redeploying does nothing).

   > `lib/supabaseClient.ts` hardcodes the *old* project as a fallback. If either env var is
   > missing or misspelled, the app silently talks to the dead project instead of failing. It logs
   > a console warning when the fallback is used — check the browser console after cutover.

7. **Redeploy the edge function** and its secrets:
   ```bash
   supabase functions deploy send-alert-email --project-ref <newref>
   supabase secrets set RESEND_API_KEY=... RESEND_FROM_EMAIL=... --project-ref <newref>
   ```

8. **Update the monitors** to the new project's health URL.

### Restore a single table

Full replays are disruptive. For one table:

```bash
age -d -i backup-key.txt -o data.sql restore/data.sql.age
# data.sql is COPY-formatted; extract just the block you need
awk '/^COPY public\.tickets /,/^\\\.$/' data.sql > tickets.sql
psql "$DB_URL" -c 'CREATE TABLE tickets_restored (LIKE tickets INCLUDING ALL);'
# edit tickets.sql to target tickets_restored, replay, then reconcile deliberately
```

Restore into a side table and reconcile — never replay straight over a live table.

## Verifying the backups work

**A backup you have never restored is not a backup.**

- **Monthly, automatic:** `restore-drill.yml` replays the newest dump into a throwaway PostgreSQL 17
  container and asserts row counts, tenancy referential integrity, auth presence, and that RLS is
  still enabled. It fails loudly on a hollow restore. Run it manually any time with
  **Actions → Restore Drill → Run workflow**.

- **Annually, by hand:** the automated drill runs against vanilla Postgres, so it **cannot test that
  anyone can actually log in**. Once a year, restore into a real Supabase project, point a local
  build at it, and sign in as a real user. That is the only way to exercise the `auth.users` restore
  end to end.

- **Test the failure path too.** Temporarily revoke the R2 token's write access and confirm the
  workflow fails *and* the heartbeat fires. A backup pipeline whose failure mode is silence is not a
  backup pipeline.

## If backups have been failing

1. **Actions → Backup Supabase** — read the most recent run.
2. Most common cause: **the project is paused** (free tier, 7 days idle). Resume it and re-run.
3. Next most common: a **rotated database password** — the pooler connection string embeds it, so
   update `SUPABASE_DB_URL`.
4. If the schedule stopped firing entirely, check whether GitHub disabled it for repo inactivity.
   Re-enable it in the Actions tab.
