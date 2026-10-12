# Browser regression tests

End-to-end tests that drive the real app (`v2/`) in a phone-sized Chromium. Supabase is replaced by an
in-memory mock inside `harness.mjs`, so the tests never touch the real Planly database or any account.

## Run locally

```sh
npm install --no-save --no-package-lock playwright@1.56.1
npx playwright install chromium
PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS=1 node tests/browser/projects-tabs.test.mjs
```

Each test prints one `PASS`/`FAIL` line per check and ends with `N passed, M failed`; it exits non-zero on any failure.

Optional settings:

- `PLANLY_ROOT=/path/to/other/checkout` serves a different copy of the app, for example the base branch, to compare.
- `PLANLY_CHROMIUM=/path/to/chromium` uses an existing Chromium instead of Playwright's.
- `PLANLY_SUPABASE_UMD=/path/to/supabase.js` serves a local copy of the pinned supabase-js bundle, for machines that
  cannot reach cdn.jsdelivr.net.

The tests use port 8765, so run one at a time.

## Tests

| File | What it checks |
|---|---|
| `projects-tabs.test.mjs` | Bottom tabs always leave Projects (#250). Typed work is saved, or the editor stays open when it has no name or saving is refused. Untouched or unchanged editors just close. A Household choice counts as typed work. |
| `undated-repeats.test.mjs` | A repeating task with no date (a weekly chore) comes back on its next repeat day when ticked. This covers your own chores (made by the app) and the other person's (the next date sent to the server, migration 052). Dated repeats are unchanged. |
| `fitness-food.test.mjs` | The Fitness tab (5.1): five tabs on one row; targets worked out and saved; Open Food Facts search (answered locally), adding, favourites, quick add, edit, delete; offline changes sent when back online; a change made on another device is not overwritten; only this person's food is read or written, and only the search words go to Open Food Facts. The base branch has no Fitness tab, so this test is not compared against it. |
| `fitness-scan.test.mjs` | The barcode scanner (stage 3): Chromium's fake camera shows a real EAN-13 barcode drawn by the test, so the bundled ZXing decoder runs end to end. The product opens and is saved with its barcode; the camera is switched off when a code is found or the scanner closes; only the barcode number goes to Open Food Facts (answered locally); mistyped codes are caught; unknown codes offer Quick add or search; favourites work offline; a barcode typed into Search works; a refused camera explains how to allow it. |

CI: `.github/workflows/browser-tests.yml` runs these on every pull request that touches `v2/` or `tests/browser/`.
On a pull request it also runs them against the base branch for comparison; that run is informational, not a gate.
