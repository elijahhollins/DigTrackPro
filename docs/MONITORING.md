# Monitoring

Before this, outages were discovered by customer phone call. There were no health checks, no
probes, and no alerting anywhere in the stack.

## The health endpoint

`GET /api/health` (`api/health.js`) checks the things that can realistically break:

| Check | What it proves | Fatal? |
|---|---|---|
| `database` | Postgres executed `public.health_check()` | **Yes** |
| `auth` | GoTrue is serving (`/auth/v1/health`) | **Yes** |
| `storage` | Storage API is answering | No — degraded |
| `ai` | `ANTHROPIC_API_KEY` or `GEMINI_API_KEY` is present | No — degraded |

Responses:

- **200 `{"status":"ok"}`** — database and auth are up
- **200 `{"status":"ok","degraded":true}`** — core is fine, but photo upload or ticket scanning is
  impaired
- **503 `{"status":"error"}`** — database or auth is down; the app is unusable

It returns **503 rather than 200-with-a-status-field** because uptime monitors key on status codes.
Each subcheck is bounded at 3 seconds and they run in parallel, so the endpoint answers in about 3
seconds even when Supabase is completely wedged — it cannot hang the monitor.

The body carries booleans and latencies only. No key material, and no raw upstream error text —
upstream errors can echo connection strings, and this endpoint is public.

**Why a function and not a table query:** selecting from a table under RLS returns a cheerful 200
with zero rows even when policies are broken, so it cannot tell "healthy but empty" from "badly
wrong". Executing `health_check()` proves Postgres actually ran something, and returns no business
data.

### Deploy the migration first

`/api/health` returns 503 until `supabase/migrations/20260807000000_add_health_check.sql` is applied
— the RPC 404s and the database check fails. Apply it before creating monitors, or the first alert
you get will be your own.

```bash
supabase db push --project-ref fusubnzndmngjfgatzrq
# or paste the migration into the SQL editor
```

Verify:

```bash
curl -i https://<your-domain>/api/health
```

## Monitors

Better Stack Uptime's free tier covers all of this: 10 monitors, 3-minute checks, response-body
keyword assertions, mobile push, a status page, and — the reason it's the pick over UptimeRobot —
free heartbeat monitors.

| # | Target | Interval | Assert | Catches |
|---|---|---|---|---|
| 1 | `https://<domain>/api/health` | 3 min | 200 + body contains `"status":"ok"` | Supabase down, config broken |
| 2 | `https://<domain>/` | 5 min | 200 | Vercel/CDN/deploy broken |
| 3 | `https://fusubnzndmngjfgatzrq.supabase.co/auth/v1/health` | 5 min | 200 | Supabase itself, **independently of your app** |

Monitor 3 is worth the slot even though monitor 1 covers the same dependency: when both fire, it's
Supabase; when only 1 fires, it's your code or config. That distinction is the difference between
"wait it out" and "start debugging" at 3am.

## Heartbeats — the part that is easy to skip and shouldn't be

Create two **heartbeat/cron monitors** and set them as repository secrets:

| Secret | Watches | Expected period |
|---|---|---|
| `BACKUP_HEARTBEAT_URL` | Nightly backup | ~26 hours |
| `RESTORE_DRILL_HEARTBEAT_URL` | Monthly restore drill | ~35 days |

GitHub emails you when a workflow **fails**. It does not tell you when a workflow **never runs** —
and **GitHub automatically disables scheduled workflows after 60 days of repository inactivity**.
For a backup cron on a repo that goes quiet, that failure mode produces complete silence, which is
indistinguishable from everything working.

The heartbeat inverts it: no ping within the window means you get paged. Without it, the most likely
way to lose your backups is for them to quietly stop.

The backup workflow pings `$BACKUP_HEARTBEAT_URL/<project>` per project, so a failure of just the
landing CRM is distinguishable from a total failure.

## Testing the alerting

Alerting you have never seen fire is not alerting.

- **Health endpoint 503:** in a Vercel preview deploy, set `SUPABASE_URL` to a bad hostname and
  confirm `/api/health` returns 503 and Better Stack alerts within one check interval.
- **Heartbeat:** disable the backup workflow for a day and confirm you get paged.
- **Backup failure:** temporarily revoke the R2 token's write permission and confirm the workflow
  fails *and* the heartbeat does not fire.

## Total cost

$0. Better Stack's free tier covers every monitor above.
