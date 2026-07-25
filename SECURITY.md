# Security notes

## Accepted risk: `xlsx` (SheetJS) 0.18.5

`npm audit` reports two high-severity advisories against `xlsx` and says
"No fix available". That is accurate for the npm registry, and the finding is
knowingly left open rather than overlooked.

- [GHSA-4r6h-8v6p-xvw6](https://github.com/advisories/GHSA-4r6h-8v6p-xvw6) — prototype pollution (fixed upstream in 0.19.3)
- [GHSA-5pgg-2g8v-p4x9](https://github.com/advisories/GHSA-5pgg-2g8v-p4x9) — regular-expression denial of service (fixed upstream in 0.20.2)

### Why it is still here

SheetJS stopped publishing to npm after 0.18.5 (2022) and moved distribution to
its own CDN, so no registry version of `xlsx` contains either fix. The official
patched tarball lives at `https://cdn.sheetjs.com/`, which this project's build
environment cannot reach — the host is denied by the organisation's outbound
egress policy, so putting that URL in `package.json` would make `npm install`
fail in CI and in Claude Code web sessions.

### Exposure

`XLSX.read` is only reached from the two spreadsheet import modals, and it runs
client-side in the browser on a file the signed-in user picked themselves. There
is no server-side parsing, so this is not remotely reachable: exploiting it means
persuading someone to import a hostile `.csv`/`.xlsx`/`.xls`.

If that happened, the realistic impact is confined to that user's own tab —
prototype pollution could lead to script execution in their session (which holds
a Supabase access token), and the ReDoS would hang the tab until reload. The
export path in `TimesheetView` only *writes* a workbook and never parses
untrusted input, so it is unaffected.

### How to close it

Either route works once the dependency can actually be obtained:

1. **Preferred** — have an admin allowlist `cdn.sheetjs.com`, then depend on the
   first-party tarball: `"xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"`.
2. **Alternative** — switch to `@e965/xlsx`, a third-party republish of SheetJS
   Community Edition to npm. Verified drop-in: `XLSX.version` 0.20.3, no
   dependencies, and byte-identical output to 0.18.5 across every call this app
   makes (`json_to_sheet`, `book_new`, `book_append_sheet`, `write`/`writeFile`
   with `bookType: 'csv'`, `read` with `type: 'array'` and `cellDates`, and
   `sheet_to_json` with `defval`). The trade-off is trusting a republisher
   instead of SheetJS directly.

`exceljs` and `read-excel-file` were considered and rejected: neither reads
legacy `.xls`, which both import modals accept.

Revisit when `cdn.sheetjs.com` becomes reachable, or if spreadsheet parsing ever
moves server-side — that would change the exposure assessment above and make
this urgent.
