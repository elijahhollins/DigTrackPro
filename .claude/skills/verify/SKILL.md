# Verify — DigTrackPro

Vite + React + Supabase SPA. No test suite; verification is driving the app in
a browser. `npm run lint` is `tsc --noEmit`.

## Full app

The real app needs Supabase credentials (`VITE_SUPABASE_URL` /
`VITE_SUPABASE_ANON_KEY` via `.env`); without them, verify components through a
mock harness instead (below).

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
