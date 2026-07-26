# Verify — DigTrackPro

Vite + React + Supabase SPA. No test suite; verification is driving the app in
a browser. `npm run lint` is `tsc --noEmit`.

## Full app (no backend) — `test-harness/`

`test-harness/vite.config.ts` aliases `lib/supabaseClient.ts` to an in-memory
fake Supabase (`test-harness/mockSupabase.ts`) seeded from `test-harness/seed.ts`,
so **every view and every service runs its real code** against fixture data —
only the network is replaced. Use this to drive the whole app:

```bash
npx vite --config test-harness/vite.config.ts   # port 5200, strict
# open http://localhost:5200/
```

The fake covers the slice of Supabase the app uses: `from()` with
select/insert/upsert/update/delete + eq/neq/in/is/gte/lte/gt/lt/ilike/contains/
match/order/limit/single/maybeSingle, `auth`, `storage`, `rpc`, `functions.invoke`
and `channel()`. `window.__harness.db` exposes the tables, so Playwright can
assert on writes:

```js
await page.evaluate(() => window.__harness.db.tickets.filter(t => t.refresh_requested));
```

The seed spans every ticket status (valid / expiring / refresh-requested /
expired / pending / no-show / archived / completed-job), all four optional
modules, and deliberately includes one legacy work-log row missing `rate` to
keep the NaN guards honest. The session signs in as an ADMIN automatically.

Gotchas when driving it:
- Both the sidebar and the mobile bottom bar are `<nav>`; scope to
  `aside button` / `nav button:visible` or you'll click a hidden element.
- The day-9 dig-check modal covers the dashboard on load — dismiss it with the
  "Save All for Later" button first.
- Clicking a job number opens the Job Summary; clicking elsewhere in the row
  expands the group.

The real app needs Supabase credentials (`VITE_SUPABASE_URL` /
`VITE_SUPABASE_ANON_KEY` via `.env`); prefer the harness over pointing a dev
server at the production project.

## PdfMarkupEditor harness (no backend needed)

`verify-harness/` mounts the real `PdfMarkupEditor` with `services/apiService.ts`
aliased to an in-memory mock (same pattern as `vite.preview.config.ts` for the
Scheduler). To run:

```bash
node verify-harness/makePdf.mjs     # generates verify-harness/test.pdf (6 pages, grid + labels, page 4 landscape)
npx vite --config verify-harness/vite.config.ts   # port 5199, strict
# open http://localhost:5199/verify-harness/index.html
```

Drive with Playwright (`/opt/node22/lib/node_modules/playwright/index.mjs`,
executablePath `/opt/pw-browsers/chromium` on the remote runner).

Useful selectors / facts:
- Scroll container: `.overflow-auto.flex-1` (a div, not `<main>`).
- Zoom % readout: `button[title="Reset zoom"]` text; ± buttons via
  `title="Zoom in"` / `title="Zoom out"`; tools by `title` (e.g. `Rectangle`).
- Page containers: `[data-page="N"]`; rendered bitmap = child `canvas` with
  `width > 100`. Wait for that before interacting.
- Page indicator text: `Page N / M`.

Gotchas that produced false failures before:
- Playwright wheel events fire at the **current mouse position** — call
  `page.mouse.move(x, y)` before `mouse.wheel`, and remember `page.click`
  moves the mouse (e.g. onto the toolbar). Wheel zoom anchors at the cursor,
  or viewport centre when the cursor is outside the scroll container.
- Ctrl+wheel zoom commits ~120 ms after the last wheel event; wait ~600 ms
  before measuring.
- Zoom anchoring check: record `{page, nx, ny}` of the point under the cursor
  via `elementFromPoint(...).closest('[data-page]')` before and after; drift
  should be sub-pixel.
- Multi-touch pinch via CDP `Input.dispatchTouchEvent`: for `touchEnd`,
  `touchPoints` lists the fingers being **released** (empty = release all).
  Listing the remaining finger instead silently re-registers it as a new
  touch on the next `touchMove`, turning the tail of the gesture into a
  second pinch — which masks release/handoff bugs. Always end a pinch by
  lifting one finger (its id in touchEnd), drifting the survivor a few
  hundred ms, then lifting it — that path is where release jumps live.
