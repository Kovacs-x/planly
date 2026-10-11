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

CI: `.github/workflows/browser-tests.yml` runs these on every pull request that touches `v2/` or `tests/browser/`.
On a pull request it also runs them against the base branch for comparison; that run is informational, not a gate.
