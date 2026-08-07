# Offline behavior

Field techs work in poor-signal areas. Before this, losing signal produced a fully loaded UI showing
**zero tickets** — because the service layer swallowed errors and returned `[]`, and `App.tsx`
mapped every rejection to `[]` on top of that. "The backend is down" and "you have no work today"
looked identical.

For a crew deciding whether it's safe to dig, that's the wrong failure mode. This layer makes the
app tell the truth.

## Three connection states, not two

`navigator.onLine` only reports link-layer status. It says `true` on a captive portal, and it says
`true` when Supabase is down — which is exactly the case that used to render as an empty account.

| State | Meaning | Reads |
|---|---|---|
| `online` | Supabase reachable | Network, written through to cache |
| `offline` | No network link | Cache |
| `degraded` | Link is up, **Supabase unreachable** | Cache |

`lib/connectivity.ts` probes `/auth/v1/health` (cheap, unauthenticated, unaffected by RLS) on the
`online` event and every 60s while degraded. It polls only while something is wrong — a healthy app
makes no extra requests.

`components/ConnectionBanner.tsx` renders a banner in the two non-healthy states and nothing at all
when things are fine.

## What is cached

Declared in `services/offlinePolicy.ts`, which **fails closed**: anything not listed is online-only.
That default is the safety property — a method added next year is conservative without anyone
remembering this file exists. Do not add a catch-all.

- **Cached reads:** `getTickets`, `getJobs`, `getNotes`, `getPhotos`, `getUsers`, `getCompany`,
  `getNoShows`, `getJobPrints` — what a crew needs standing in a field.
- **Online-only:** auth, company creation, invites, role changes, super-admin views, email sends,
  and **all deletes**. Replaying a delete after the row changed server-side destroys data someone
  meant to keep, and a queue can't tell the difference.
- **Not cached, deliberately:** `getAllCompanies` and anything cross-tenant.

Online reads **always** hit the network. This is not stale-while-revalidate — cached data is only
ever served after we've already told the user they're offline.

## Tenant isolation

Multi-tenancy is enforced entirely by Postgres RLS. Once data is on the device, **RLS is no longer
in the loop**, so the cache has to provide that isolation itself.

**One IndexedDB database per user**, named `digtrack-cache-v1-<userId>`. Not one shared database
with a `userId` column — physically separate databases make cross-tenant leakage *structurally*
impossible rather than dependent on every query remembering to filter. These are shared truck
tablets where several techs log in and out of the same device, so the distinction is the whole
point.

On sign-out or a user change, the auth listener in `App.tsx` deletes every cache database that
doesn't belong to the user now signed in. Cached records also carry a `companyId` that is checked
against the live session before being served — belt and braces.

## Staleness — the safety-critical part

**Cached tickets expire correctly on their own.** `getTicketStatus` (`utils/dateUtils.ts`) computes
status at render time from the current clock against `workDate`/`expires`/`digByDate` — it is not a
stored field. So a ticket cached as VALID will flip to EXTENDABLE and then EXPIRED with no network
at all.

> Do not "optimize" that into a persisted status column. It is load-bearing for offline safety.

What *does* go dangerously stale is server-side state the device can't see: `refreshRequested`,
`noShowRequested`, `isArchived`, and whether a newer ticket has superseded this one.

### The 12-hour ceiling

Past 12 hours, cached data is **refused**, not shown:

> You're offline and this data is 13 hours old, which is too old to rely on. Reconnect before
> digging.

Showing nothing is safer than showing something wrong. This is the inversion of the original bug,
where wrong (empty) was shown as if it were right.

**This number is a judgment call, not a derived value.** 12 hours covers a normal shift: a tech who
started the day connected keeps working all day, and overnight data is refused. If crews routinely
work multi-day stretches with no signal, this will lock them out mid-shift — which is a real cost,
and the reason to revisit it deliberately with the people doing the digging rather than quietly
raising `STALE_CEILING_MS` to make a support ticket go away.

## Service worker

`public/sw.js` caches the app shell so the app *loads* offline:

- **Network-first for `index.html`** — the escape hatch from a bad deploy. A broken cached shell can
  otherwise brick every installed client permanently.
- **Cache-first for `/assets/*`** — Vite emits content-hashed filenames, so they're immutable.
- **Never caches Supabase responses.** The Cache API is scoped to the origin, not the signed-in
  user, so caching authenticated API responses there would be a cross-tenant leak. Per-user data
  belongs in IndexedDB.

## Testing it

DevTools' offline toggle is necessary but not sufficient — it can't produce the `degraded` state,
which is the one that used to be invisible.

1. **Offline:** DevTools → Network → Offline. Reload. The app should load from the shell cache and
   show the offline banner with cached tickets.
2. **Degraded:** leave the network up and block `*.supabase.co` via DevTools → Network request
   blocking. This must show "Can't reach the server", **not** an empty ticket list. This is the
   important test.
3. **Tenant isolation:** log in as user A, sign out, log in as user B, then run
   `await indexedDB.databases()` in the console. Only B's database may exist. Repeat across a full
   page reload.
4. **Staleness ceiling:** in the console, rewrite a cached entry's `cachedAt` to 13 hours ago and
   reload. The refusal message must appear instead of tickets.

## Offline writes

Writes listed as `queueableWrite` in `offlinePolicy.ts` are recorded in an IndexedDB `outbox` and
replayed on reconnect: `saveTicket`, `saveJob`, `addNote`, `addNoShow`, `updateTicketCoords`. Each is
an idempotent upsert or an insert with a client-generated id, so replaying one twice is a no-op.

Everything else — including **every delete** — still fails loudly while offline. A write that fails
visibly beats one that silently disappears.

### Replay rules

- **Strictly in queue order, one at a time, halting on the first transient failure.** That preserves
  causality: create a job, then add tickets to it. Parallel replay would reorder dependent writes
  and break foreign keys.
- **Errors are classified, never blanket-retried.** Network failures and 5xx stay queued. RLS
  denials, constraint violations and validation errors are **parked** — retrying a deterministic
  400 forever means the queue never drains and the user is never told.
- **Duplicate-key errors count as success.** Every queued insert carries a client-generated id, so a
  duplicate means the original attempt landed and we just never saw the response. Treating it as a
  failure would park operations that actually worked.
- **Parked operations are surfaced**, with their reason, and Try-again / Discard controls
  (`PendingWrites` in `components/ConnectionBanner.tsx`). Nothing is ever dropped silently.
- **Ticket edits check for conflicts.** Before replaying a `saveTicket`, the queue re-reads the
  server row's `updated_at`; if someone changed the ticket while you were offline, the edit is
  parked for review instead of clobbering. Everything else is last-write-wins, matching what the
  database already does. This is why `tickets.updated_at` exists
  (`supabase/migrations/20260807010000_add_tickets_updated_at.sql`) — stamped by a trigger, since
  the whole point is detecting writes the client didn't make.

Replay is triggered on reconnect, on app start, and when a backgrounded tab becomes visible again
(mobile browsers freeze timers, so the 60s poll may not have run).

### Signing out discards unsynced changes

This is a genuine trade-off, made deliberately. Signing out wipes the device cache — required,
because these are shared tablets and cached data would otherwise be readable by the next person to
sign in — and that wipe takes any unsent writes with it.

Losing a no-show report silently is not acceptable, so the app **asks first**: signing out with
unsynced changes shows a confirmation naming how many will be discarded. The purge also logs what it
destroyed.

**If you have unsynced changes, reconnect and let them sync before signing out.**

### Known limitation

`addPhoto` is deliberately **not** queueable. It mints a new id on each call, so replaying it would
create duplicate photos rather than being idempotent. Photo uploads still require a connection.
