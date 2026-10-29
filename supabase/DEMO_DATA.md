# Demo account data (Example Excavating Inc.)

The demo account is the company with every feature flag enabled — the one used
for walkthroughs and screenshots. It holds ~320 rows of internally-consistent
data across tickets, jobs, inventory, dispatch, time tracking, daily reports,
work logs and invoices, spread over the Chicago collar counties.

| | |
|---|---|
| Company | Example Excavating Inc. |
| `company_id` | `da0eea4d-b2c2-4b7f-b31a-5c5dd87f272d` |
| Admin login | `crazyshiplifr@gmail.com` |
| Project | `fusubnzndmngjfgatzrq` |
| Originally seeded | PR #169, directly against the database (no file was committed) |

All of these scripts run the same way as everything else in this directory:
paste into **Supabase Dashboard → SQL Editor → New query → Run**. Nothing here
executes automatically.

---

## The demo goes stale, and how to fix it

Every date in the dataset was written as an absolute value on the day it was
seeded. Ticket status is not stored — `utils/dateUtils.ts::getTicketStatus`
derives it from `work_date`, `expires`, `dig_by_date`, `work_begun` and
`refresh_requested`. So as real time moves on, the whole scenario ages out:
tickets expire, the dispatch board empties, and the urgency views stop showing
anything worth demoing.

### `refresh_demo_dates.sql` — slide every date to today

Run it whenever the demo looks stale. It finds how far behind the dataset is
and shifts **every** date forward by that one number of days, so each interval
between rows survives and the status mix stays exactly as designed.

It covers all the shapes dates take in this schema:

| Shape | Example | Handling |
|---|---|---|
| `date` | `tickets.dig_by_date` | `col + delta` |
| `timestamptz` | `time_entries.clocked_in_at` | whole days, so the time of day survives |
| ISO text | `tickets.expires`, `inbound_tickets.due_date` | rewritten only where the value really is `YYYY-MM-DD` |
| epoch millis | `notes.timestamp`, `no_shows.timestamp` | `col + delta * 86400000` |
| jsonb | `invoices.data`, `work_logs.data`, `ticket_updates.changes` | every embedded date string is rewritten |

Worth knowing:

- **Re-running it the same day does nothing.** The shift is derived from the
  data (the oldest demo job is the anchor), so there is no window in which it
  double-shifts. Run it as often as you like.
- **It leaves your own clicking alone.** Only rows created in the original seed
  batch move. A ticket you add in the app afterwards keeps its real dates.
- **It is scoped to the demo company.** No other tenant's rows are touched.
- **Nested dates cannot double-shift.** Dates inside jsonb are swapped through
  placeholders, so a value that lands on another date already in the same
  document is still shifted exactly once.

---

## Rebuilding the data if it is lost

### `dump_demo_seed.sql` — generate a restore file from the live account

This one is a *generator*: it reads the demo data out of the database and
prints a complete, ready-to-run seed file as a single value.

1. Run it in the SQL Editor.
2. Copy the single returned value.
3. Save it as `supabase/seed_demo_example_excavating.sql` and commit it.

The output is ~240 KB (one JSON field per line, so git diffs stay readable). It
loads through `jsonb_populate_recordset`, inserts parents before children so
the foreign keys hold at every step, uses `ON CONFLICT (id) DO NOTHING` (so
re-running it against an intact account changes nothing), and advances the
`bigserial` sequences past the restored ids so the next insert from the app
does not collide.

It is a generator rather than a committed snapshot because the demo account is
live — crews get added, inventory moves, invoices get written. A file committed
today starts drifting immediately, while the generator always emits the account
as it currently stands. Regenerate and re-commit whenever the demo changes
meaningfully.

**Limits, stated plainly:**

- **Tied to this project.** Company and profile UUIDs are embedded, so the
  output restores into `fusubnzndmngjfgatzrq`. It is not a portable fixture for
  a fresh project.
- **Content only.** It does not dump `companies` or `profiles`, and it cannot
  create auth users. The generated file checks that the company and the three
  demo profiles exist and stops with a clear message naming what is missing.
- **No Storage objects.** Blueprint PDFs and photos referenced by
  `job_prints.storage_path` and `inbound_ticket_photos.storage_path` live in
  Storage buckets and are not part of the dump.
- **Needs a live database.** If the project itself is gone, the generator has
  nothing to read — that is the argument for keeping a generated snapshot
  committed, not just the generator.

After seeding, run `refresh_demo_dates.sql` to bring the restored dates to the
current day.

---

## Other seed files here

`seed_inbound_tickets.sql` is unrelated to this account: it is a standalone
12-ticket fixture for exercising the inbound (811) dashboard in **any**
company. You edit the two placeholder UUIDs at the top before running it.
